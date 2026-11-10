// Pure simulation-only snapshot and exact NGN reconciliation.
// Never authorizes money movement or recognizes earned revenue.
import {createHash} from 'node:crypto'
const money=v=>{
  if(typeof v!=='string'||!/^(0|[1-9]\d*)$/.test(v))throw new TypeError('Whole NGN string required')
  return BigInt(v)
}
const sorted=(items)=>items.sort((a,b)=>a.ledger_kind.localeCompare(b.ledger_kind)
  ||a.evidence_reference.localeCompare(b.evidence_reference)
  ||String(a.recipient_id||'').localeCompare(String(b.recipient_id||'')))
export function buildAdSimulationSnapshot(preflight){
  const p=preflight?.preview
  if(!p||!preflight?.campaign?.id||!p.pools||!p.talent||!p.explorer
     ||!Array.isArray(preflight.blockers))throw new TypeError('Complete admin preflight required')
  const lines=[{ledger_kind:'platform',recipient_id:null,evidence_reference:'platform-pool',amount_naira:p.pools.platform}]
  for(const t of p.talent.allocations){
    if(!t.recipientId)throw new TypeError('Missing Talent identifier')
    lines.push({ledger_kind:'talent',recipient_id:t.recipientId,evidence_reference:t.recipientId,amount_naira:t.amount})
  }
  for(const slot of p.explorer.slots){
    if(!slot.sourceId||!slot.discovererId)throw new TypeError('Missing verified Discovery source')
    lines.push({ledger_kind:'explorer',recipient_id:slot.discovererId,
      evidence_reference:slot.sourceId,amount_naira:slot.amountNa})
  }
  if(money(p.talent.unallocated)>0n)lines.push({
    ledger_kind:'unallocated_talent',recipient_id:null,evidence_reference:'unallocated-talent',amount_naira:p.talent.unallocated
  })
  if(money(p.explorer.unallocated)>0n)lines.push({
    ledger_kind:'unallocated_explorer',recipient_id:null,evidence_reference:'unallocated-explorer',amount_naira:p.explorer.unallocated
  })
  sorted(lines)
  const kinds=new Set(lines.map(l=>l.ledger_kind+'|'+l.evidence_reference))
  if(kinds.size!==lines.length)throw new RangeError('Duplicate allocation evidence')
  const sum=k=>lines.filter(l=>l.ledger_kind===k).reduce((s,l)=>s+money(l.amount_naira),0n)
  if(sum('talent')+sum('unallocated_talent')!==money(p.pools.talent)
    ||sum('explorer')+sum('unallocated_explorer')!==money(p.pools.explorer)
    ||sum('platform')!==money(p.pools.platform)
    ||lines.reduce((s,l)=>s+money(l.amount_naira),0n)!==money(p.pools.earned)
    ||money(p.pools.earned)!==money(preflight.candidate_earned_na))
    throw new RangeError('Simulation allocation does not reconcile exactly')
  const snapshot={
    schema_version:1,campaign_id:preflight.campaign.id,
    campaign_state:preflight.campaign.state,
    campaign_start:preflight.campaign.start_at,
    campaign_end:preflight.campaign.end_at,
    pricing_policy:p.policy,
    qualification_policy:preflight.qualification_policy,
    selected_talents:preflight.eligible_talents,
    explorer_slots:preflight.qualified_discovery_slots,
    recorded_funding_na:preflight.verified_funding_evidence_na,
    billable_units:preflight.billable_units,
    candidate_earned_na:preflight.candidate_earned_na,
    pools:p.pools,blockers:[...preflight.blockers],
    lines
  }
  const fingerprint=createHash('sha256').update(JSON.stringify(snapshot)).digest('hex')
  return {snapshot,fingerprint,lines}
}
