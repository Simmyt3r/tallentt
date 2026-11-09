// Release D: immutable-input, dry-run reward preview. ZERO financial writes.
// One reward slot is one qualified first Discovery of a selected Talent.
// The owner has not yet approved the exact Discovery lookback and orphan-pool
// disposition; this is a provisional attribution policy, not a payout rule.
import {splitAdvertisingRevenue,allocateEqualPool} from './adAllocation.js'
const amount=value=>{
  if(typeof value==='number'&&(!Number.isSafeInteger(value)||value<0))throw new RangeError('Expected a safe whole NGN amount')
  if(!['string','number','bigint'].includes(typeof value))throw new TypeError('Expected integer NGN amount')
  const number=BigInt(value)
  if(number<0n)throw new RangeError('NGN amount cannot be negative')
  return number
}
const id=value=>typeof value==='string'&&value.trim().length>0
function checkedIds(input,name){
  if(!Array.isArray(input)||input.some(x=>!id(x)))throw new TypeError(name+' must be non-empty identifiers')
  const sorted=[...input].sort()
  if(new Set(sorted).size!==sorted.length)throw new RangeError('Duplicate '+name+' IDs')
  return sorted
}
export function eligibleDiscoverySlots(selectedTalentIds,discoveryEvidence,{maxPerTalent=10}={}){
  const talents=checkedIds(selectedTalentIds,'Talent')
  if(!Number.isInteger(maxPerTalent)||maxPerTalent<1||maxPerTalent>10)throw new RangeError('Maximum Discoverers must be 1–10')
  if(!Array.isArray(discoveryEvidence))throw new TypeError('Verified Discovery evidence array required')
  const allowed=new Set(talents),seenPair=new Set(),seenSource=new Set()
  const grouped=new Map(talents.map(t=>[t,[]]))
  // Evidence rows must be trusted server-query results, NOT client input.
  for(const e of discoveryEvidence){
    if(!e||!id(e.talentId)||!id(e.discovererId)||!id(e.sourceId)||!id(e.createdAt))
      throw new TypeError('Incomplete verified Discovery evidence')
    if(!allowed.has(e.talentId)||e.talentId===e.discovererId)continue
    if(Number.isNaN(Date.parse(e.createdAt)))throw new TypeError('Invalid verified event time')
    const pair=e.talentId+'|'+e.discovererId
    if(seenPair.has(pair)||seenSource.has(e.sourceId))continue
    seenPair.add(pair);seenSource.add(e.sourceId)
    grouped.get(e.talentId).push(e)
  }
  const slots=[]
  for(const talentId of talents){
    const first=[...grouped.get(talentId)]
      .sort((a,b)=>Date.parse(a.createdAt)-Date.parse(b.createdAt)
        ||a.sourceId.localeCompare(b.sourceId)).slice(0,maxPerTalent)
    slots.push(...first.map(e=>({
      talentId,discovererId:e.discovererId,sourceId:e.sourceId,createdAt:e.createdAt
    })))
  }
  return slots
}
export function distributeExplorerSlots(poolValue,slots){
  const pool=amount(poolValue)
  if(!Array.isArray(slots))throw new TypeError('Eligible slot array required')
  if(!slots.length)return {slots:[],recipients:[],unallocated:pool.toString()}
  const keys=slots.map(s=>s.talentId+'|'+s.discovererId)
  if(keys.some((k,i)=>k==='undefined|undefined'||keys.indexOf(k)!==i))
    throw new RangeError('Duplicate or malformed Discovery slot')
  const count=BigInt(slots.length),each=pool/count
  let extra=pool%count
  const detailed=[...slots].sort((a,b)=>a.talentId.localeCompare(b.talentId)
    ||a.createdAt.localeCompare(b.createdAt)||a.sourceId.localeCompare(b.sourceId))
    .map(s=>{const bonus=extra>0n?1n:0n;if(bonus)extra--
      return {...s,amountNa:(each+bonus).toString()}
    })
  const users=new Map()
  for(const s of detailed)users.set(s.discovererId,(users.get(s.discovererId)||0n)+BigInt(s.amountNa))
  const recipients=[...users].sort(([a],[b])=>a.localeCompare(b))
    .map(([recipientId,total])=>({recipientId,amountNa:total.toString()}))
  return {slots:detailed,recipients,unallocated:'0'}
}
export function simulateVerifiedRewards({earnedNa,selectedTalentIds,verifiedDiscoveryEvidence,maxPerTalent=10,
  split}){
  const talents=checkedIds(selectedTalentIds,'Talent')
  const pools=splitAdvertisingRevenue(earnedNa,split)
  const slots=eligibleDiscoverySlots(talents,verifiedDiscoveryEvidence,{maxPerTalent})
  const talent=allocateEqualPool(pools.talent,talents)
  const explorer=distributeExplorerSlots(pools.explorer,slots)
  if(BigInt(pools.platform)+BigInt(pools.talent)+BigInt(pools.explorer)!==BigInt(pools.earned))
    throw new Error('Campaign allocations are not balanced')
  if(explorer.slots.reduce((s,row)=>s+BigInt(row.amountNa),0n)+BigInt(explorer.unallocated)!==BigInt(pools.explorer))
    throw new Error('Explorer allocations do not reconcile')
  return {pools,talent,explorer,policy:'provisional-early-discovery-v1',
    disbursementEnabled:false,approvedForPayment:false}
}
