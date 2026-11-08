# Step 4 — Admin Paystack reference review (read-only)

## Workflow

In **Admin → Finance → Paystack reference review**, paste a single transaction reference and press **Check reference — read only**. This requests the transaction status from Paystack's server using the existing server-side secret key, then compares the provider's verified reference, status, NGN kobo amount, intended wallet amount and owner with ChombuTar's wallet ledger.

Supported source categories:
- New wallet top-ups: wallet journal reference exactly equals the verified Paystack reference, with the verified metadata wallet owner and intended whole-naira credit.
- Cached legacy booking checkouts: wallet journal reference `paystack:<reference>`, cross-checked against the booking owner and original escrow ID.

The screen identifies **verified provider success but no wallet posting**, duplicate/conflicting ledger references, owner/amount mismatches, invalid payment source, or a successful provider–wallet match. It displays no payment-card credentials or Paystack customer email.

## Controls and safeguards

- **Admin only**, through the existing authenticated Admin POST route `action: finance_paystack_reference`.
- One exact reference per manual request, length and character validated; no bulk external traffic or wallet enumeration.
- Read only: this code makes a provider **GET verification call** and database **SELECT** queries only. It does not adjust balances, credit missing funds, issue refunds, retry failed payments, or migrate schema.
- Source-linked customer money is never treated as platform fees.
- Status **matched** means a successful provider transaction matches one wallet journal entry. It does **not** mean Paystack settled its balance to the company's bank, that a withdrawal was paid, or that external net revenue has been recognized.
- Bank settlement remains explicitly **unverified**; accounts staff must independently compare the Paystack settlement ledger/export with bank statements. Reconcile every mismatch manually before authorizing credits/refunds.
- Provider outage should report an error rather than pretending the balance or settlement is zero.

## Tests

`node --test tests/finance-paystack-reference.test.mjs`: correctly matched reference, missing posting, under-credit, wrong payer, failed provider status, legacy escrow source, invalid input, Admin authorization, and no wallet or journal mutations.

Billing Verification, full CI, API syntax and PWA build must pass. For deployment, `PAYSTACK_SECRET_KEY` is server-only; never commit a key or return Paystack raw PII to the browser.

## Outstanding bank reconciliation

An operator must still compare actual Paystack settlements, fees, reserves and bank deposits by settlement ID/date. Without a bank feed and Paystack settlement-export credentials this application cannot assert company cash-on-hand. This feature is only the first, transaction-level verification gate.
