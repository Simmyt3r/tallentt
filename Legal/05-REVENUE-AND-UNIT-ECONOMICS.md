# Revenue, Fees and Subscription Policy — October 2026

## Commercial decisions
The product owner selected these prices for ChombuTar. They replace the earlier **unapproved 8%/10% commission scenarios**; they do not establish earned revenue or authorize unreviewed external transfers.

| Product | Approved pricing | Treatment |
|---|---|---|
| Sealed gig | 5% of the agreed gig value | Seller-side fee booked once when client funds/seals the deal; talent receives net on milestones; unearned commission reversed on refunded escrow |
| Bank-transfer salary tracking | ₦1,000 per person per salary month (initial rate) | Both employer/client and talent pay separate fees; Admin may adjust rate for future months |
| Cash salary tracking | ₦500 per person per salary month (initial rate) | Both parties pay; ChombuTar does not independently verify cash |
| Salary tracking using completed escrow | Fixed naira amount, not yet approved | Disabled until Admin sets the fixed price; both parties then pay per month |
| Business verification review | ₦3,000 per application | Paid from applicant wallet. Manual CAC check; rejection refunds wallet, approval grants business-verified status |
| Talent membership | Free / Green Pro / Black Vaulted | Paid plan prices and entitlements **not yet approved** |
| Client membership | Free / Business / Enterprise | Paid plan prices and entitlements **not yet approved** |

**Fee disclosure:** checkout states the total paid by the client, the platform's 5% fee, and the net amount payable to the talent. A ₦50,000 fully released gig yields ₦2,500 platform commission and ₦47,500 total talent receipts. A 30% start release pays ₦15,000 gross less ₦750, and the final ₦35,000 release pays less ₦1,750.

**Refund policy:** in a formal dispute, the **unreleased** escrow balance is returned in full if Admin orders a refund. For newly sealed deals, the portion of commission attributable to that refunded balance is reversed in an adjustment ledger. Any earlier settled milestone and its associated fee are not automatically reversed; disputed earlier disbursements require separate legal and payment resolution. Disputes and wallet refunds remain auditable.

**Payment distinction:** bank/cash salary reports are user statements, not bank-verified transfers. Each salary month carries a separate fixed fee for the employer/client and for the talent. The client pays when reporting; the talent pays only after confirming receipt. **Only confirmed months for which BOTH fees are paid appear as paid-confirmed Work Pass evidence.** Disputed reports refund collected tracking fees; correcting a report requires a new monthly charge. An escrow-tracked salary references a completed escrow and is a separate service from gig commission.

## Rollout
The fee policy is coded, but **requires application of the Monetization and Dual-role Billing migrations (in that order, after Employment) in Admin > Database Migrations**. Previously funded escrows keep their historical fee terms. A new wallet-funded escrow freezes and books the 5% seller commission at sealing; milestone payouts do not book it again. A refund reverses the unearned share. Gig fees are distinct from monthly salary tracking. Audit and revenue reporting do not count gross escrow holdings as company income.

The billing management screen lets an authorized Admin set and enable monthly prices. Because plan benefits/entitlements, renewal disclosures, taxes, cancellation policies and refund policies have not been provided, **paid membership should remain disabled pending a complete approved benefits policy**. Free stays free. Work Pass Bronze/Silver/Gold/Diamond tiers are earned work-trust levels, not subscription products.

Business verification is a paid application for *manual review*, **not** an automatic government credential, professional certification or future-work guarantee. Validate CAC details through official records, document approval evidence, restrict reviewer access and comply with Nigerian data protection requirements before production activation.

## Illustrative unit economics (not an actual processor quote)
On an example ₦50,000 completed gig, gross platform fee is ₦2,500. If hypothetical processor and payout costs total ₦900, contribution before disputes, chargebacks, taxes and operating costs would be ₦1,600. At ₦485,000 fixed monthly costs, this would require **304** similar fully completed gigs merely to cover those hypothetical costs. Actual processor fees, reserve requirements, VAT/tax, chargebacks and escrow legal classification must be verified with processor and counsel.

## Current revenue status
No verified earned customer revenue is established solely by code commits. The fee tables and finance reporting record fee events; they do not prove merchant settlement, economic ownership of client funds, or net profit. Wallet balances and secured escrow balances are liabilities, not free platform cash.

## Monitoring and approval gates
Track completed gig value, released commissions, salary tracking reports and refunds, CAC approvals/refunds, payment processor costs, subscription price acceptance, churn, refund/dispute rate, customer acquisition cost and actual bank settlements. Obtain legal/accounting review of the escrow model, user-facing service terms, invoice disclosure, subscription cancellation policy and taxation before broad paid launch.

## One Work Pass, independent roles
Users with both client and talent roles have a single profile and signed Work Pass QR. Their Talent Orbit reflects completed work; their Client Orbit reflects successful hiring. Common identity and activity factors are shared, but role-specific performance factors are isolated. An earned tier for a dual-role identity must come from one independently qualified role, not an artificial combination of unrelated client and talent achievements.

Monthly salary evidence is shown in the role-specific section only when salary receipt is confirmed and both tracking receipts are paid. Changing a fee in Admin never retroactively increases a fee already quoted on an employer's salary report. The bank/cash rates above are initial defaults and may be changed with an audit record; the fixed escrow tracking fee is awaiting approval.
