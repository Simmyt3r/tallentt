# Nigerian Legal and Compliance Register — ChombuTar

**Status convention:** NOT VERIFIED means no executed filing, policy or independent regulatory confirmation has been supplied to this review. This does not prove no document exists elsewhere.

| Workstream / instrument | Priority | Status | Accountable function | Minimum content and gate |
|---|---|---|---|---|
| CAC company incorporation, registers, beneficial ownership and tax identifiers | P0 | In progress / details not supplied | Founder + counsel | Verify company name, share capital, directors, PSCs, activity objects, statutory records before executing contracts |
| Shareholders and founder agreement | P0 | Not executed | All three | Equity, board, reserved matters, dilution, dividends, leavers and deadlock |
| Subscription/investment agreement | P0 | Not executed | Investor + counsel | Amount, consideration, conditions, tranche funding, closing, reporting, defaults |
| Silabs development, support and IP assignment/licence | P0 | Not executed | Silabs + counsel | Acceptance tests, delivered assets, security, SLAs, fees, source ownership and handover |
| Main Terms of Service and Booking/Escrow terms | P0 | Code contains short notices | Product + counsel | Eligibility, independent contractors, offer acceptance, 30/70 release, cancellation, refund, disputes, takedowns, user safety and limitation language |
| Privacy notice, DPA and retention schedule | P0 | Incomplete evidence | Privacy lead | NDPA lawful bases, purposes, processors, transfers, video consent, data requests, breach, deletion and retention |
| Payment-provider and financial regulatory legal opinion | P0 | Not verified | Finance + counsel | Confirm whether wallet, stored value, escrow, safeguarded funds and payouts are carried out by licensed entities/arrangements; no unsanctioned deposit-taking |
| Business tax and accounting setup | P0 | Not verified | Accountant | Tax registration, applicable VAT / WHT / PAYE duties, accurate classification of investor contributions and platform fees |
| Content moderation, youth safety and takedown | P0 | Technical modules exist | Trust + operations | Harassment, inappropriate media, appeals, user-generated content, copyright, evidence preservation and emergency response |
| Advertising and ambassador contracts | P1 | Not evidenced | Marketing + counsel | Content rights, payment, disclosures, testimonial truthfulness, applicable ARCON vetting |
| Trademark search and filing | P1 | Not verified | Founder + counsel | Search ChombuTar names/logos, classes, registered owner and future international strategy |
| Employment / contractor and confidentiality | P1 | Not evidenced | Admin | IP, NDAs, payment, confidentiality, labor status and conflicts |
| Cybersecurity and disaster recovery plan | P0 | Tests/config exist, no full approval | Tech + security | Access control, secret rotation, backup drills, breach handling and external security testing |
| Domain ownership and software vendor contracts | P1 | Not supplied | Founder + tech | Commercial plan rights, authorized owners, renewal and recovery |

## Actual registration UI risks
The current app's short Terms, Privacy, Cookie and Vendor notices are held in src/pages/AuthPage.jsx. Its signup checkbox references affiliate/vendor terms, rather than obtaining clear acceptance of **main Terms of Service**. Update with full, versioned documents, separate marketing opt-in where necessary, record accepted version/time/account and provide accessible copies. The Terms' release-on-confirmed-delivery statement must match actual 30/70 payment lifecycle and transaction terms.

## Work Pass verification risk
Bronze/Silver/Gold/Diamond status, past-customer endorsements and QR cryptographic checks must not imply formal government certification, regulated professional licensing or guaranteed future performance. Publish transparent criteria, appeals, invalidation, expiry, signature key security and evidence controls.

## Media rights
Written media license must allow only the necessary service, verification and opted-in promotions. A QR overlay/verified sticker in external shared videos requires accurate verification claims; respect copyright, privacy and the platform's watermark terms.

## Nigerian legal reference starting points
- CAC: https://www.cac.gov.ng/ and official fee schedule at https://news.cac.gov.ng/wp-content/uploads/2025/06/New-Schedule-of-Fees-29th-May-2025.pdf
- NDPC: https://ndpc.gov.ng/ (Nigeria Data Protection Act and implementing guidance)
- CBN: https://www.cbn.gov.ng/ (financial services regulation)
- ARCON: https://arcon.gov.ng/ (advertising regulation)
- Nigerian IP office/registry: verify official trademark registry and current fee schedule through a registered practitioner.

**No regulatory exemption, tax eligibility, CAC completion, trademark protection or payment-licensing status is presumed.** Counsel should validate the facts and operative rules as of filing/launch date.
