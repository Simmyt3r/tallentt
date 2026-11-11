// Strictly read-only commercial launch preflight. Nothing here can authorize
// advertiser charging, ad delivery, Orbit rewards, or monetary settlement.
export const PILOT_SCHEMA=Object.freeze([
  'ad_advertisers','ad_campaigns','ad_campaign_terms','ad_funding_receipts',
  'ad_billable_events','ad_creatives','ad_review_history','ad_talent_ad_policy',
  'ad_hat_placements','ad_placement_detachments',
  'ad_settlement_simulations','ad_settlement_simulation_lines',
  'ad_settlement_simulation_reviews','orbit_verified_events','orbit_discovery_sessions',
])
export const PILOT_POLICY_BLOCKERS=Object.freeze([
  {code:'PRICING_NOT_APPROVED',label:'Approve billable advertising metrics, tariffs, delivery guarantees and contract versions'},
  {code:'DISCOVERY_POLICY_PENDING',label:'Approve early-Discovery attribution, Explorer slot distribution and zero-recipient pool policy'},
  {code:'TALENT_DETACH_POLICY_PENDING',label:'Approve premature detachment, replacement inventory and refund consequences'},
  {code:'CURATOR_BONUS_POLICY_PENDING',label:'Approve Curator eligibility, bonus budget and over-allocation handling'},
  {code:'ADVERTISER_POLICY_PENDING',label:'Approve advertiser identity, prohibited categories, creative licensing and Talent endorsement wording'},
  {code:'DISPUTE_POLICY_PENDING',label:'Approve cancellation, refund, review/appeal and payout hold deadlines'},
])
export const PILOT_ENGINEERING_BLOCKERS=Object.freeze([
  {code:'EXTERNAL_FUNDING_UNVERIFIED',label:'Payment-provider or bank reconciliation is not implemented for advertising receipts'},
  {code:'BILLABLE_DELIVERY_UNVERIFIED',label:'Server-trusted billable delivery, invalid-traffic review, attribution and pacing are not implemented'},
  {code:'PRODUCTION_PAYOUT_DISABLED',label:'Atomic double-entry advertising settlement, reversals and payout authorization are not implemented'},
  {code:'SIGNED_AD_UPLOADS_MISSING',label:'Advertiser rights confirmation and signed media upload validation are incomplete'},
  {code:'CAMPAIGN_ACTIVATION_MISSING',label:'Approved, funded campaign activation and assignment are not implemented'},
  {code:'AUDITED_FREQUENCY_MISSING',label:'Browser-session frequency limits cannot serve as paid delivery evidence'},
])
export function summarizeAdPilotReadiness({tables={},environment={},counts={}}={}){
  const installed=PILOT_SCHEMA.filter(name=>Boolean(tables[name]))
  const missing=PILOT_SCHEMA.filter(name=>!tables[name])
  const blockers=[
    ...missing.map(name=>({code:'SCHEMA_MISSING',label:'Database migration missing: '+name})),
    ...PILOT_POLICY_BLOCKERS,...PILOT_ENGINEERING_BLOCKERS,
  ]
  const issues=[
    {code:'PREVIEW_FLAG',label:'Sponsored banners allowed in current preview environment',
      pass:environment.is_preview===true&&environment.banner_preview_flag===true},
    {code:'VIDEO_PREVIEW_FLAG',label:'Sponsored video previews allowed in current preview environment',
      pass:environment.is_preview===true&&environment.banner_preview_flag===true
        &&environment.video_preview_flag===true},
    {code:'SIMULATION_FLAG',label:'Test-only settlement snapshots enabled on preview',
      pass:environment.is_preview===true&&environment.simulation_preview_flag===true},
  ]
  return {
    stage:'F1_NONFINANCIAL_PILOT_READINESS',
    schema:{installed:installed.length,total:PILOT_SCHEMA.length,missing},
    data_counts:counts,
    environment:{is_preview:environment.is_preview===true,
      banner_preview_flag:environment.banner_preview_flag===true,
      video_preview_flag:environment.video_preview_flag===true,
      simulation_preview_flag:environment.simulation_preview_flag===true},
    preview_capabilities:issues,
    blockers,
    pilot_ready:false,paid_delivery_allowed:false,
    paid_campaign_activation_allowed:false,
    external_payment_verified:false,
    payouts_enabled:false,
    user_wallets_modified:false,
    note:'Read-only assessment of stored application records, NOT bank/provider settlements. Existing receipt statuses and billable events are unverified internal assertions; no financial launch authorization is implied.',
  }
}
