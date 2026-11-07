# Step 4 — Finance read-only review and source-linked billing verification

## Objective

Make Admin Finance a trustworthy **read-only view by default** and distinguish customer liabilities from source-linked platform charges. This batch does **not** change approved fees, charge any subscriber, refund a wallet, move escrow, or execute a production migration.

## Implemented in this batch

1. **Viewing is not posting.** Admin Finance initial load and Refresh read the existing finance summary only. They do not call historical service-charge reconciliation or create receipts.
2. **Explicit reconciliation.** A clearly named **Reconcile verified receipts** action requires confirmation. It invokes the pre-existing transaction-verified, idempotent service-charge receipt recovery. It can write matched historical fee/reversal records, but cannot itself debit a wallet or change an old deal's agreed rate. Finance can then refresh normally.
3. **Billing collection evidence.** Subscription, verification and each monthly salary-tracking side count toward the *recorded fee charges* total only if their charged receipt has **exactly one** successful, same-user, same-reference, same-amount `billing_charge` wallet transaction. Charged rows missing this match are flagged as **unmatched**, not silently counted as income.
4. **Refinements to role-specific incomes.** The existing Admin income categories distinguish Client tracking (`salary_tracking`) from Talent tracking (`salary_tracking_talent`), along with subscriptions, business verification, Live support and deal service charges. This batch exposes **individual billing receipt audits** with subscriber, source UUID, amount, charge/refund state, matching successful debits and refunds, and internal reference. Refunded receipts do not count as currently charged collections. Missing/duplicated refund records are flagged.
5. **Partial accounting conventions preserved.** Billing collections are *pending revenue recognition*, not earned income or bank settlement. Earned revenue continues to comprise verified Live support fees and deal service-charge records after refund reversals. Escrow obligations, wallet balances, withdrawal commitments, sponsor-to-Talent principal and any money paid through the app never get added to platform revenue.

## Constraints and audit risks

- A successful **wallet debit is not proof that money reached ChombuTar's bank account**. Actual settlement reconciliation needs Paystack/bank settlement references and processor costs.
- Charge receipt tables may be missing on an older database. Admin reports indicate absent recording rather than guessing zero revenue.
- Unmatched charged receipts require review; this batch does not automatically correct, replay or debit them.
- A successful explicit service-charge reconciliation cannot infer fees for legacy contracts with missing stored fee terms or ambiguous matching wallet transactions. Those remain unrecognized.
- Client/Talent full-time tracking fees remain admin-adjustable *fixed monthly amounts*, each party billed separately. This batch changes reporting only, not pricing, charge triggers or compensation.
- Finance totals remain partial pending tax, refunds, costs, payouts, and source-policy determination for Collab/Hire/Sponsor fees.
- The existing deal service-charge stream reflects recorded fee events including the previously authorized test data. It must not be represented as verified real-money production earnings until bank and transaction records are independently verified.

## Verification before production

- [ ] Database tests: verified subscriber charge is counted; no wallet debit -> not counted; refunded charge -> excluded; audit shows missing refund evidence.
- [ ] Browser test: loading/refreshing Admin Finance generates **zero POST writes**; declined reconciliation generates none; confirmed explicit reconciliation issues the existing POST exactly once.
- [ ] All CI, billing, quality and affected browser checks green on the final PR.
- [ ] Production: verify migrations, make a backup, cross-check fee rows against wallet/escrow and independent gateway settlement, and inspect the unmatched count. Do not apply financial migrations automatically.

## Next Step 4 batches

- Non-mutating reconciliation reports comparing ledger receipts to gateway settlement and wallet liabilities; identify missing, duplicate or reversed entries without changing customer money.
- Fixed monthly salary fee statement by employment period (both parties) and dispute-aware refund audit.
- Explicit approved fee-event policy for **Collab/Hire/Sponsor** platform revenue; no fee may be invented or deducted without owner sign-off.
- User-facing receipt and QR payment settlement audit through the closed-beta journey; no real-money test deductions.
