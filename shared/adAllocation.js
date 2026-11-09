// Pure, simulation-only allocation math. Never moves wallet balances.
// The campaign must be fully earned and verified before these allocations
// can be considered for any separate payout process.
const nonNegative=value=>{
  if(typeof value==='number'&&(!Number.isSafeInteger(value)||value<0))throw new RangeError('Use non-negative integer NGN amounts')
  if(typeof value!=='number'&&typeof value!=='string'&&typeof value!=='bigint')throw new TypeError('Invalid amount')
  const n=BigInt(value)
  if(n<0n)throw new RangeError('Amount cannot be negative')
  return n
}
export const DEFAULT_AD_SPLIT=Object.freeze({platform:6000,talent:2800,explorer:1200})

export function splitAdvertisingRevenue(earnedNa,split=DEFAULT_AD_SPLIT){
  const earned=nonNegative(earnedNa)
  const rates=[split.platform,split.talent,split.explorer]
  if(!rates.every(x=>Number.isInteger(x)&&x>=0&&x<=10000)
    ||rates.reduce((a,b)=>a+b,0)!==10000)throw new RangeError('Split must total exactly 10000 bps')
  const floors=rates.map(bps=>earned*BigInt(bps)/10000n)
  // Largest remainder method: no lost NGN, deterministic tie order.
  const remainders=rates.map((bps,i)=>({index:i,rem:earned*BigInt(bps)%10000n}))
    .sort((a,b)=>a.rem===b.rem?a.index-b.index:a.rem>b.rem?-1:1)
  let spare=earned-floors.reduce((a,b)=>a+b,0n)
  for(const item of remainders){if(spare===0n)break;floors[item.index]++;spare--}
  return {earned:earned.toString(),platform:floors[0].toString(),
    talent:floors[1].toString(),explorer:floors[2].toString()}
}

export function allocateEqualPool(poolNa,recipientIds){
  const pool=nonNegative(poolNa)
  if(!Array.isArray(recipientIds))throw new TypeError('Recipient IDs required')
  if(recipientIds.some(id=>typeof id!=='string'||!id.trim()))throw new TypeError('Invalid recipient ID')
  const recipients=[...recipientIds].sort()
  if(new Set(recipients).size!==recipients.length)throw new RangeError('Duplicate recipients')
  if(!recipients.length)return {allocations:[],unallocated:pool.toString()}
  const count=BigInt(recipients.length),each=pool/count
  let remainder=pool%count
  const allocations=recipients.map(id=>{
    const increment=remainder>0n?1n:0n
    if(increment)remainder--
    return {recipientId:id,amount:(each+increment).toString()}
  })
  return {allocations,unallocated:'0'}
}

export function simulateAdvertisingAllocation({earnedNa,talentIds=[],explorerIds=[]}){
  const pools=splitAdvertisingRevenue(earnedNa)
  return {pools,talent:allocateEqualPool(pools.talent,talentIds),
    explorer:allocateEqualPool(pools.explorer,explorerIds)}
}
