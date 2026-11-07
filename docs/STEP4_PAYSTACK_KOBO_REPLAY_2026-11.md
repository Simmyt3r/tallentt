# Step 4 — Paystack wallet top-up precision and idempotency hardening

## Scope

Harden the existing wallet top-up application logic, without changing the QR checkpoint protocol, escrow payout shares, platform commission rates or withdrawal flow.

1. **Compare actual verified integer kobo** against the exact intended whole-naira top-up. A ₦99.50 payment does **not** satisfy a requested ₦100 credit. Invalid, fractional or non-finite provider amounts cannot produce wallet credit.
2. Require the verified transaction's **reference**, successful status, **NGN currency**, wallet-top-up metadata and wallet **user ID** to match the request.
3. Reject reused references belonging to another subscriber or a different wallet operation. Do not return a misleading `alreadyProcessed: true` for someone else's journal row.
4. If two verified callbacks race on a reference, use the existing unique wallet transaction index and database transaction rollback. Treat a unique-key conflict as a benign retry only after verifying the already-committed journal row is an exact successful top-up for the same user.
5. A matching verified callback can still be replayed safely: no extra wallet balance or notification. Credited amount remains the customer's *intended* amount, excluding Paystack's external processing fee gross-up.

## Non-goals and limits

- No real Paystack charge is initiated, no customer funds are moved, no database migration or fee recalculation.
- This only governs an **already verified Paystack transaction**; receipt matching remains internal evidence until provider/bank settlement reconciliation is completed.
- Pre-existing stale PWA payments must carry their original wallet user ID and verified reference; unowned or mismatched transactions require manual support investigation, not guessing.
- The existing 30/70 QR release and duplicate scan tests stay unchanged; this batch closes a separate wallet funding precision gap.

## Verification

- Run `node --test tests/wallet-topup-kobo-replay.test.mjs` for successful intended credit, 99.50/99.99 underpayments, NaN/infinity/fraction inputs, wrong owner/reference/currency, reused references, notifications and simultaneous callbacks.
- Run full CI, billing verification and affected UI suites before merging.
- Staging: use the Paystack *test environment* (not real transfers) and confirm correct credited amounts, references and idempotency.
