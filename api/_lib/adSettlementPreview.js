// Release D: ADMIN-ONLY read-side settlement analysis.
// This service cannot create, approve, transfer, post or release money.
import {query} from './db.js'
import {simulateVerifiedRewards} from '../../shared/adRewardPreview.js'

const UUID=/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i
const bad=(status,message)=>Object.assign(new Error(message),{status})
const toBig=value=>BigInt(String(value||0))
async function available(){
  const {rows}=await query(`SELECT
    to_regclass('ad_campaigns') AS campaigns,
    to_regclass('ad_campaign_terms') AS terms,
    to_regclass('ad_billable_events') AS billables,
    to_regclass('ad_funding_receipts') AS funding,
    to_regclass('ad_hat_placements') AS placements,
    to_regclass('ad_talent_ad_policy') AS policies,
    to_regclass('orbit_verified_events') AS discovery,
    to_regclass('orbit_discovery_sessions') AS sessions`)
  const required=Object.values(rows[0]||{})
  return required.every(Boolean)
}
export async function adminAdvertisingSettlementOverview(){
  if(!await available())return {available:false,campaigns:[],payouts_enabled:false,
    note:'Apply approved advertising and verified Discovery migrations in staging before previewing.'}
  const {rows}=await query(`SELECT c.id,c.title,c.state,c.start_at,c.end_at,a.legal_name AS advertiser,
    (SELECT COUNT(DISTINCT h.user_id)::int FROM ad_hat_placements p JOIN hats h ON h.id=p.hat_id
      WHERE p.campaign_id=c.id AND p.state IN ('reserved','active','expired')) AS talent_count,
    (SELECT COUNT(*)::int FROM ad_hat_placements p WHERE p.campaign_id=c.id AND p.state='detached') AS detached_count
    FROM ad_campaigns c JOIN ad_advertisers a ON a.id=c.advertiser_id
    ORDER BY c.created_at DESC LIMIT 60`)
  return {available:true,campaigns:rows,payouts_enabled:false,
    note:'Candidate previews are not earnings, wallet liabilities or approved payouts.'}
}
export async function adminAdvertisingSettlementPreview(campaignId){
  if(!UUID.test(String(campaignId||'')))throw bad(400,'Select a valid advertising campaign.')
  if(!await available())throw bad(503,'Advertising or qualified Discovery migrations are unavailable.')
  const {rows:campaigns}=await query(`SELECT c.id,c.title,c.state,c.start_at,c.end_at,
    c.currency,a.legal_name AS advertiser,c.delivery_enabled
    FROM ad_campaigns c JOIN ad_advertisers a ON a.id=c.advertiser_id WHERE c.id=$1`,[campaignId])
  const campaign=campaigns[0]
  if(!campaign)throw bad(404,'Advertising campaign not found.')
  const blockers=['Payout approvals and refund rules are not yet configured.',
    'Provider funding verification and billing-event ingestion are not independently reconciled.',
    'Early-Discovery window, detached Talent treatment and unused pool disposition require owner approval.']
  const start=campaign.start_at?new Date(campaign.start_at):null
  const end=campaign.end_at?new Date(campaign.end_at):null
  const complete=Boolean(start&&end&&Number.isFinite(start.getTime())&&Number.isFinite(end.getTime())
    &&end.getTime()-start.getTime()===30*24*60*60*1000&&end.getTime()<=Date.now())
  if(!complete)blockers.push('The campaign has not completed a valid 30-day delivery window.')
  if(!['verifying','settled'].includes(campaign.state))
    blockers.push('The campaign is not in the verification/settlement state.')
  const [{rows:terms},{rows:funding},{rows:billables},{rows:talents},{rows:discovery}]=await Promise.all([
    query(`SELECT id,version,metric,unit_price_naira::text AS unit_price_naira,
      budget_cap_naira::text AS budget_cap_naira,minimum_billable_units,
      platform_bps,talent_bps,explorer_bps,approved_at,accepted_at
      FROM ad_campaign_terms WHERE campaign_id=$1 ORDER BY version DESC LIMIT 5`,[campaignId]),
    query(`SELECT COALESCE(SUM(amount_naira),0)::text AS verified_funding,
      COUNT(*) FILTER (WHERE status='verified')::int AS verified_receipts
      FROM ad_funding_receipts WHERE campaign_id=$1 AND status='verified' AND verified_at IS NOT NULL`,[campaignId]),
    query(`SELECT terms_id,event_type,COUNT(*)::text AS units
      FROM ad_billable_events WHERE campaign_id=$1 AND verified_at IS NOT NULL
        AND invalidated_at IS NULL
        AND ($2::timestamptz IS NULL OR created_at >= $2)
        AND ($3::timestamptz IS NULL OR created_at < $3)
      GROUP BY terms_id,event_type`,[campaignId,start,end]),
    query(`SELECT h.user_id AS talent_id,COUNT(*)::int AS hat_count
      FROM ad_hat_placements p JOIN hats h ON h.id=p.hat_id
      JOIN ad_talent_ad_policy policy ON policy.user_id=h.user_id
      WHERE p.campaign_id=$1 AND h.role='talent'
        AND p.state IN ('reserved','active','expired')
        AND policy.accepted_at<=COALESCE($2::timestamptz,now())
      GROUP BY h.user_id ORDER BY h.user_id LIMIT 101`,[campaignId,start]),
    query(`WITH selected AS (
      SELECT DISTINCT h.user_id AS talent_id FROM ad_hat_placements p
      JOIN hats h ON h.id=p.hat_id
      JOIN ad_talent_ad_policy policy ON policy.user_id=h.user_id
      WHERE p.campaign_id=$1 AND h.role='talent'
        AND p.state IN ('reserved','active','expired')
        AND policy.accepted_at<=COALESCE($2::timestamptz,now())
    ), qualified AS (
      SELECT s.talent_id,s.viewer_id,s.id AS source_id,
        e.created_at,ROW_NUMBER() OVER(PARTITION BY s.talent_id ORDER BY e.created_at,e.id) AS rank
      FROM selected t JOIN orbit_discovery_sessions s ON s.talent_id=t.talent_id
      JOIN orbit_verified_events e ON e.source_type='discovery' AND e.source_id=s.id
        AND e.verb='Discover' AND e.status='verified' AND e.actor_id=s.viewer_id
        AND e.subject_id=s.talent_id AND e.beneficiary_id=s.talent_id
      JOIN orbit_verified_events x ON x.source_type='discovery' AND x.source_id=s.id
        AND x.verb='Explorer' AND x.status='verified' AND x.actor_id=s.viewer_id
        AND x.subject_id=s.talent_id AND x.beneficiary_id=s.viewer_id
      WHERE s.state='awarded' AND s.viewer_id<>s.talent_id
        AND $2::timestamptz IS NOT NULL
        AND e.created_at >= $2::timestamptz-INTERVAL '30 days'
        AND e.created_at < $2::timestamptz
    ) SELECT talent_id,viewer_id,source_id,created_at
       FROM qualified WHERE rank<=10 ORDER BY talent_id,created_at,source_id LIMIT 1000`,[campaignId,start]),
  ])
  const accepted=terms.filter(t=>t.accepted_at&&t.approved_at)
  if(accepted.length!==1)blockers.push('Exactly one approved and accepted campaign pricing version is required.')
  if(talents.length>100)blockers.push('Campaign selection exceeds the original 100-Talent limit.')
  if(talents.length<10)blockers.push('Fewer than ten eligible participating Talents are selected.')
  const {rows:detach}=await query(`SELECT COUNT(*)::int AS detached FROM ad_hat_placements WHERE campaign_id=$1 AND state='detached'`,[campaignId])
  if(detach[0]?.detached>0)blockers.push('Detached placements require an agreed earnings adjustment.')
  const term=accepted.length===1?accepted[0]:null
  const verifiedFunding=toBig(funding[0]?.verified_funding)
  let candidateEarned=null,preview=null,eligibleUnits=null
  if(term){
    const matched=billables.filter(e=>e.terms_id===term.id&&e.event_type===term.metric)
    const units=matched.reduce((total,r)=>total+toBig(r.units),0n)
    eligibleUnits=units.toString()
    const budget=toBig(term.budget_cap_naira)
    const price=toBig(term.unit_price_naira)
    const estimated=units*price
    candidateEarned=(estimated<budget?estimated:budget).toString()
    if(verifiedFunding<budget)blockers.push('Recorded verified funding is less than the agreed campaign budget cap.')
    if(term.minimum_billable_units!=null&&units<toBig(term.minimum_billable_units))
      blockers.push('Minimum agreed delivery units have not been reached.')
    const evidence=discovery.map(e=>({talentId:e.talent_id,discovererId:e.viewer_id,
      sourceId:e.source_id,createdAt:new Date(e.created_at).toISOString()}))
    preview=simulateVerifiedRewards({
      earnedNa:candidateEarned,
      selectedTalentIds:talents.slice(0,100).map(t=>t.talent_id),
      verifiedDiscoveryEvidence:evidence,
      split:{platform:term.platform_bps,talent:term.talent_bps,explorer:term.explorer_bps},
    })
    if(preview.explorer.unallocated!=='0')blockers.push('Explorer pool has no verified recipients and must remain unallocated.')
    if(preview.talent.unallocated!=='0')blockers.push('Talent pool has no selected recipients and must remain unallocated.')
  }else blockers.push('No billable amount is calculable without agreed commercial terms.')
  return {campaign:{id:campaign.id,title:campaign.title,state:campaign.state,
    start_at:campaign.start_at,end_at:campaign.end_at,advertiser:campaign.advertiser},
    eligible_talents:talents.length,qualified_discovery_slots:discovery.length,
    verified_funding_evidence_na:verifiedFunding.toString(),
    billable_units:eligibleUnits,candidate_earned_na:candidateEarned,
    preview,blockers,
    payouts_enabled:false,can_settle:false,can_post_wallet:false,
    qualification_policy:'Provisional: up to 10 earliest mutually verified Discovery/Explorer sessions per selected Talent during the 30 days before campaign start. NOT OWNER APPROVED.',
    warning:'Read-only candidate calculation. Funding receipts and billable-event status are not independently reconciled provider evidence; no revenue recognition or payout may be inferred.'}
}
