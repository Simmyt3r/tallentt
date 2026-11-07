# Step 4 finance follow-up — read-only billing and wallet integrity checks

## Purpose

Admin Finance now has an explicit **Run read-only check** action. It compares the current billing receipts with matching internal wallet journal rows and displays discrepancies, *without changing subscriber balances, escrow holdings, prices, receipts, or revenue totals*.

## What it checks

- **Unverified charge:** a billed receipt does not have exactly one successful wallet debit with the same user, reference and amount.
- **Unverified refund:** a refunded receipt lacks exactly one matching successful wallet refund.
- **Unexpected refund:** a wallet refund is present but its receipt remains marked charged (even if the refund amount differs).
- **Collection suppression:** Admin recorded collections exclude receipts with any successful same-reference wallet refund, even when their receipt state has not been updated. The audit marks these for investigation instead of overstating revenue.
- **Orphan wallet charge/refund:** a successful billing journal entry has no matching current receipt (this may arise after legacy receipt updates; investigate before altering records).
- All issue categories are counted. Admin sees up to 25 latest source-linked entries, with account, amount and reference to investigate. Issue counts are not a sum of naira and may overlap by underlying transaction.

The check is **GET /api/admin?action=finance_integrity**, requires Admin authorization and sends `Cache-Control: private, no-store`. Missing billing schema fails closed with an *unavailable* status instead of a false zero.

## Crucial limitations

- A matching internal debit is **not** independent Paystack, processor or bank settlement evidence. No gateway/bank money is marked verified.
- A clean report means only that the checked billing receipt and internal wallet-journal pairs matched. It is **not** an account-wide audit, cash balance, proof of payment, annual revenue, profit, bank reconciliation, or guarantee against fraud.
- The report does not compare escrow principal to the Paystack ledger, attribute processing costs, or recognize pending salary-tracking/subscription revenue.
- Historical salary-period re-payment can replace the current receipt's reference. Orphan journal entries therefore require a careful manual reconstruction, rather than replaying charges or automatically refunding.
- No database migration, background correction, retroactive deduction, or production payment is made by this change.

## Acceptance and launch checks

1. Verify the targeted database regression `node --test tests/finance-integrity.test.mjs`, including the five discrepancy categories, missing schema fallback, Admin authorization and unchanged wallet balances.
2. Run the existing Admin Finance browser test `node tests/admin-commissions-ui.mjs` at mobile and desktop widths and confirm integrity GET generates no POST.
3. Run the full quality and CI gate; investigate failures independently from Vercel Hobby build-rate restrictions.
4. On a backed-up staging copy, review actual exception sources and receipts. Do not apply fixes to customer money without a second review and explicit approval.
5. Before production cash reporting, obtain **independent Paystack/bank settlement references**, fees, payouts and reconciliation per provider transaction, not just internal journal IDs.

## Next Step 4 work

- Period-by-period Client/Talent salary-tracking statements, including corrections and dispute refunds without overwriting prior financial history.
- Bank/gateway settlement import and reconciliation once the authoritative settlement feed and banking scope are approved.
- QR funding and 30/70 release acceptance tests with synthetic users, webhook retries and duplicate callback replay.
- Platform fee policies for Collab/Hire/Sponsor remain **unset**; do not create or collect fees until approved.
