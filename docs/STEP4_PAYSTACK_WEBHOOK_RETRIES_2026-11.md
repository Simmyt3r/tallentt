# Step 4 — Paystack webhook retry and signing compatibility

## Finding and fix

The previous `charge.success` webhook always acknowledged with HTTP 200 even when Paystack verification, a wallet database write or its transaction failed. Paystack therefore considered the event delivered, and an uncredited real payment could become invisible until a manual audit.

- Valid `charge.success` + successful verified wallet processing (or verified idempotent replay): **HTTP 200**.
- A temporary Paystack verification error (timeout, 429/5xx, unreadable response), database outage or unexpected internal exception: **HTTP 503**, `Retry-After: 60`, with a generic safe error response. Paystack can redeliver.
- A verified transaction with a permanent payer, status, currency or kobo amount mismatch: **HTTP 200** with `processed: false`, and server-side error logs for Finance follow-up. Replaying an invalid charge without account changes would never fix it.
- Invalid raw-body signature: **HTTP 401**, with no database changes. Non-`charge.success` signed events are acknowledged without processing.
- The web client callback also returns HTTP 503 for transient Paystack verification errors, rather than incorrectly presenting a permanent decline.

These changes do not alter wallet economics or initiate payments. The existing database uniqueness constraints and atomic wallet postings provide idempotency across legitimate retries.

## Paystack signing header migration

Paystack now supports a timestamped `Paystack-Signature` header:
`t=<unix seconds>,v1=whk_<key-id>:<sha512-hex>`.
For this scheme set the **server-only** Vercel environment variable `PAYSTACK_WEBHOOK_SECRET` to the full `whsec_` webhook signing secret from the Paystack Dashboard (an optional alias is `PAYSTACK_WEBHOOK_SIGNING_SECRET`). The HMAC covers `timestamp.` plus the **unchanged request bytes**; the server rejects timestamps more than 300 seconds away and accepts any matching `v1` during secret rotation.

The legacy `x-paystack-signature` signature remains validated against `PAYSTACK_SECRET_KEY` until the account transitions. A present but invalid new-format header **never falls back** to legacy credentials. Keep `PAYSTACK_SECRET_KEY` for verified transaction lookups even after the signing-header transition.

**Important:** deploy the new signing secret to the runtime before switching the Paystack webhook endpoint to the new scheme. Confirm a signed test event. Do not store these secrets in GitHub files.

## What the webhook does not prove

An internally verified Paystack transaction and posted wallet journal are **not** proof that a batch has reached the company's Nigerian settlement bank. This PR does not use bank balances, initiate transfers, refund transactions, alter fee recognition or pretend reconciliations have occurred. Operations should compare verified payment references, bank settlement reports and wallet transaction details in a separate gated process.

## Required tests

- `node --test tests/paystack-webhook-retry.test.mjs`: new rotating signing keys, expiry/tamper, legacy compatibility, temporary provider outage, explicit Paystack non-success response, rejected database transaction rollback, safe successful replay, invalid currency and insufficient kobo payments.
- `npm test`, `npm run check:api`, `npm run build`, Billing Verification, CI and Quality Gate before merge.
- Staging: webhook pointing to the test endpoint, signed test Paystack callbacks and duplicate delivery. Check that responses return 503 for transient failures and 200 after successful application. **No live-money experiments.**

Paystack documentation: https://paystack.com/docs/payments/webhooks/ and https://paystack.com/docs/api/transaction/.


## QR image acceptance hardening

The Browser QR completion test surfaced an intermittent ZXing image-URL decode failure when a valid generated PNG was uploaded. The scanner now attempts a second ZXing decode using the same uploaded image pixels on a bounded canvas (maximum dimension 1400 px) if image-URL decoding fails. No other payment token is substituted: both paths must extract the actual QR text before server-side, participant-scoped token redemption.

The existing `tests/deal-payments-qr-ui.mjs` covers the real saved QR image path and 30/70 release after work approval. Server-side integration tests separately cover invalid/expired/replaced codes, wrong participants, concurrent redemption, rollback and dispute handling. Both paths must pass before merging.
