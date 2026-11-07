# Step 4 — Private monthly salary-tracking statements (Client and Talent)

## Scope and behavior

Within an accepted employment agreement, open **Salary → View monthly tracking fee statement** on any recorded salary month. The private statement shows the Client and Talent tracking fees separately, including current receipt amount, wallet journal matching status, source reference, receipt ID and refund date when present.

The same agreement-scoped response powers both participants. It is not a publicly searchable payroll database, a downloadable tax invoice, or a statement of cash held by ChombuTar.

## Reconciliation rules

- A fee is **wallet-charge recorded** only when its current salary contribution, billing receipt and an exactly matching successful wallet debit agree on the payer, source month, reference and amount. The payer must be the correct Client or Talent.
- A fee is **wallet-refund recorded** only when both records are marked refunded and the successful wallet credit matches the receipt amount and reference exactly.
- A posted wallet refund with a still-charged receipt is marked **review**, never a clean payment.
- Missing, mismatched or stale records are flagged for human review, not repaired.
- A month with neither side's receipt is marked *No fee charged*. This does not invent an invoice or a debt due.
- Only the current receipt/contribution pair is displayed. Earlier disputed attempts may have overwritten that pair in the legacy schema, while earlier wallet journal entries remain. Finance Integrity exceptions must be used to investigate those historical changes before deciding whether money was duplicated.

**Important:** A salary marked *confirmed* is confirmed by the Talent, not by ChombuTar's bank or payroll provider. Wallet journal matches likewise do **not** establish external settlement. Salary is distinct from the platform's tracking fee; principal is not platform revenue.

## Production safety

No migration, new charge trigger, adjustment to the existing fixed monthly tracking fee, automatic refund, historical backfill or customer money movement. Missing contribution/receipt tables produce an *unavailable* statement state without guessing amounts.

The pre-existing Work Pass policy remains: the full salary month must be Talent-confirmed and both tracking fees paid. This change surfaces detailed evidence but does not alter eligibility scoring or fees.

## Required verification

- `node --test tests/salary-period-statements.test.mjs`: matching two-sided fees, refunds, stale refund, missing receipt, no fee, privacy, unchanged wallets and fail-closed missing schema.
- `npm run verify` and GitHub Billing Verification / Quality / CI before merging.
- Manual acceptance in staging with one Client and one Talent for a completed month; confirm the same private statement from both accounts and no disclosure on public profiles.

## Next step

Synthetic QR funding and 30/70 settlement replay testing, including webhook/callback duplicate delivery and disputed salary refunds. Never use real-money test deductions.
