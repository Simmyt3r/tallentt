// Admin-only Release F1 deployment and commercial risk report.
// No writes, provider calls, ad delivery, settlement or other side effects.
import {query} from './db.js'
import {PILOT_SCHEMA,summarizeAdPilotReadiness} from '../../shared/adPilotReadiness.js'

export async function adminAdvertisingPilotReadiness(db={query},env=process.env){
  const {rows}=await db.query(`SELECT name,
      to_regclass('public.'||name) IS NOT NULL AS installed
    FROM unnest($1::text[]) AS t(name)`,[PILOT_SCHEMA])
  const tables=Object.fromEntries(rows.map(r=>[r.name,r.installed]))
  const counts={}
  if(tables.ad_advertisers&&tables.ad_campaigns&&tables.ad_creatives){
    const {rows:countRows}=await db.query(`SELECT
      (SELECT COUNT(*)::int FROM ad_advertisers WHERE status='approved') AS approved_advertisers,
      (SELECT COUNT(*)::int FROM ad_advertisers WHERE status='pending') AS pending_advertisers,
      (SELECT COUNT(*)::int FROM ad_campaigns WHERE state='under_review') AS campaigns_under_review,
      (SELECT COUNT(*)::int FROM ad_campaigns WHERE state='approved') AS editorially_approved_campaigns,
      (SELECT COUNT(*)::int FROM ad_campaigns WHERE state='active') AS internally_active_campaign_records,
      (SELECT COUNT(*)::int FROM ad_creatives WHERE state='approved') AS approved_creatives,
      (SELECT COUNT(*)::int FROM ad_creatives WHERE state='pending') AS pending_creatives`)
    Object.assign(counts,countRows[0])
  }
  if(tables.ad_campaign_terms&&tables.ad_funding_receipts&&tables.ad_billable_events){
    const {rows:countRows}=await db.query(`SELECT
      (SELECT COUNT(*)::int FROM ad_campaign_terms
         WHERE approved_at IS NOT NULL AND accepted_at IS NOT NULL) AS accepted_price_records,
      (SELECT COUNT(*)::int FROM ad_funding_receipts
         WHERE status='verified' AND verified_at IS NOT NULL) AS internally_marked_funding_receipts,
      (SELECT COUNT(*)::int FROM ad_billable_events
         WHERE verified_at IS NOT NULL AND invalidated_at IS NULL) AS internally_marked_billable_events`)
    Object.assign(counts,countRows[0])
  }
  if(tables.ad_hat_placements&&tables.ad_talent_ad_policy){
    const {rows:countRows}=await db.query(`SELECT
      (SELECT COUNT(*)::int FROM ad_hat_placements WHERE state='active') AS internally_active_placements,
      (SELECT COUNT(*)::int FROM ad_hat_placements WHERE state='detached') AS detached_placements,
      (SELECT COUNT(*)::int FROM ad_talent_ad_policy
        WHERE policy_version='ad-auto-2026-11-v1') AS accepted_talent_policy_records`)
    Object.assign(counts,countRows[0])
  }
  if(tables.ad_settlement_simulations){
    const {rows:countRows}=await db.query('SELECT COUNT(*)::int AS test_simulations FROM ad_settlement_simulations')
    Object.assign(counts,countRows[0])
  }
  return summarizeAdPilotReadiness({tables,counts,environment:{
    is_preview:env.VERCEL_ENV==='preview',
    banner_preview_flag:env.CHOMBUTAR_AD_DELIVERY_ENABLED==='true',
    video_preview_flag:env.CHOMBUTAR_AD_VIDEO_DELIVERY_ENABLED==='true',
    simulation_preview_flag:env.CHOMBUTAR_AD_SIMULATION_ENABLED==='true',
  }})
}
