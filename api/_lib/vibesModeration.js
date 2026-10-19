// Risk triage must fail closed for unknown third-party provider output.
// Neither incomplete results nor unavailable analysis count as an approval.
const RISK_LEVELS=new Set(['LIKELY','VERY_LIKELY'])
export function providerVerdict(moderation){
  if(!Array.isArray(moderation)||moderation.length===0)return 'unconfigured'
  if(moderation.some(item=>item?.status==='rejected'))return 'review'
  if(moderation.every(item=>item?.status==='approved'))return 'approved'
  return 'pending'
}
export function unsafeVisionResult(safeSearch){
  if(!safeSearch || typeof safeSearch!=='object')return true
  return ['adult','violence','racy'].some(key=>RISK_LEVELS.has(String(safeSearch[key]||'')))
}
