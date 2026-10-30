# Revenue, Fees and Subscription Policy — October 2026

## Commercial decisions
The product owner selected these prices for ChombuTar. They replace the earlier **unapproved 8%/10% commission scenarios**; they do not establish earned revenue or authorize unreviewed external transfers.

| Product | Approved pricing | Treatment |
|---|---|---|
| Completed gig | 5% of completed/released gross value | Seller/talent fee deducted at payout; client funds the full agreed price, not a 5% surcharge |
| Bank-transfer salary tracking | ₦1,000 per reported salary month | Employer wallet charge on report, refundable if talent disputes full receipt |
| Cash salary tracking | ₦500 per reported salary month | Same; ChombuTar does not independently verify cash |
| Salary tracking using completed escrow | 2% of monthly salary | Employer tracking fee; separate from the gig's commission where both services are used |
| Business verification review | ₦3,000 per application | Paid from applicant wallet. Manual CAC check; rejection refunds wallet, approval grants business-verified status |
| Talent membership | Free / Green Pro / Black Vaulted | Paid plan prices and entitlements **not yet approved** |
| Client membership | Free / Business / Enterprise | Paid plan prices and entitlements **not yet approved** |

**Fee disclosure:** checkout states the total paid by the client, the platform's 5% fee, and the net amount payable to the talent. A ₦50,000 fully released gig yields ₦2,500 platform commission and ₦47,500 total talent receipts. A 30% start release pays ₦15,000 gross less ₦750, and the final ₦35,000 release pays less ₦1,750.

**Refund policy:** in a formal dispute, the **unreleased** escrow balance is returned in full if Admin orders a refund. The platform earns no gig fee on that refunded balance. Any earlier settled milestone and its associated fee are not automatically reversed; disputed earlier disbursements require separate legal and payment resolution. Disputes and wallet refunds remain auditable.

**Payment distinction:** salary bank transfer/cash reports are statements by users, not payments operated or verified by ChombuTar. Escrow salary tracking links a previously released transfer between the specified employer and talent. Salary-reporting fees are reimbursed if the talent disputes full receipt, with corrections billed separately upon re-reporting.

## Rollout
The fee policy is coded, but **requires application of the Monetization migration in Admin > Database Migrations**. Existing previously funded escrows retain a NULL rate (zero new commission). Each new eligible wallet-funded escrow freezes its rate when paid. Commission is accrued only at QR/work release checkpoints and authorized dispute releases. Audit and revenue reporting do not count gross escrow holdings as company income.

The billing management screen lets an authorized Admin set and enable monthly prices. Because plan benefits/entitlements, renewal disclosures, taxes, cancellation policies and refund policies have not been provided, **paid membership should remain disabled pending a complete approved benefits policy**. Free stays free. Work Pass Bronze/Silver/Gold/Diamond tiers are earned work-trust levels, not subscription products.

Business verification is a paid application for *manual review*, **not** an automatic government credential, professional certification or future-work guarantee. Validate CAC details through official records, document approval evidence, restrict reviewer access and comply with Nigerian data protection requirements before production activation.

## Illustrative unit economics (not an actual processor quote)
On an example ₦50,000 completed gig, gross platform fee is ₦2,500. If hypothetical processor and payout costs total ₦900, contribution before disputes, chargebacks, taxes and operating costs would be ₦1,600. At ₦485,000 fixed monthly costs, this would require **304** similar fully completed gigs merely to cover those hypothetical costs. Actual processor fees, reserve requirements, VAT/tax, chargebacks and escrow legal classification must be verified with processor and counsel.

## Current revenue status
No verified earned customer revenue is established solely by code commits. The fee tables and finance reporting record fee events; they do not prove merchant settlement, economic ownership of client funds, or net profit. Wallet balances and secured escrow balances are liabilities, not free platform cash.

## Monitoring and approval gates
Track completed gig value, released commissions, salary tracking reports and refunds, CAC approvals/refunds, payment processor costs, subscription price acceptance, churn, refund/dispute rate, customer acquisition cost and actual bank settlements. Obtain legal/accounting review of the escrow model, user-facing service terms, invoice disclosure, subscription cancellation policy and taxation before broad paid launch.
