# Discovery anti-mining policy — daily cap and expiry

Owner request: maximum ten Discoveries per day, and Discoveries should expire.

## Implemented
- Ten successfully qualified Discoveries per account per Nigeria calendar day (Africa/Lagos). Successful verified awards count even if later revoked. Ordinary browsing is not limited by this policy.
- Award path rechecks the quota after acquiring the existing ordered viewer/Talent user-row locks. Both automatic completion and manual Admin approval share this path. No Admin bypass; existing same-pair uniqueness remains.
- Early open and complete checks reject new Discovery claims when quota is exhausted. Existing replay of a completed session is still idempotent.
- Advertising eligibility expires exactly 30 elapsed days after verified award for a new campaign. The owner has confirmed this duration. A Discovery unexpired at campaign start is considered by the existing first-ten-per-Talent preflight; expiry during the campaign does not invalidate its preflight eligibility for post-campaign verification.
- Expiration never deletes historical Discover/Explorer records, reduces earned Orbit/Hat credits, or allows requalification of the same viewer/Talent pair. Fraud revocation remains independent.
- No migration, payout, billing, wallet changes or automatic allocation is introduced.

## Tests
Daily limit, previous-day reset, revoked records consuming quota, simultaneous completions, Admin approval, and exact reward expiry boundary with historical evidence retained.

## Separate pending work
Public views/Discovery counts and discoverer identities require end-to-end frontend and API privacy changes. This patch does not implement that visibility policy. Existing live advertising and payouts remain disabled.
