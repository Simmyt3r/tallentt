// ChombuTar pricing policy v1. Money uses integer NGN and integer basis
// points; percentages are never computed using binary floating-point money.
// A Work Pass tier is an earned reputation tier, NOT a paid subscription.
export const GIG_FEE_BPS = 500
export const SALARY_BANK_FEE_NGN = 1000
export const SALARY_CASH_FEE_NGN = 500
export const BUSINESS_VERIFICATION_FEE_NGN = 3000

export const TALENT_PLANS = Object.freeze([
  {id:'free',name:'Free',amountNaira:0,available:true},
  {id:'green_pro',name:'Green Pro',amountNaira:null,available:false},
  {id:'black_vaulted',name:'Black Vaulted',amountNaira:null,available:false},
])
export const CLIENT_PLANS = Object.freeze([
  {id:'free',name:'Free',amountNaira:0,available:true},
  {id:'business',name:'Business',amountNaira:null,available:false},
  {id:'enterprise',name:'Enterprise',amountNaira:null,available:false},
])

function naira(value){
  if(!Number.isSafeInteger(value)||value<0||value>2_147_483_647)
    throw new RangeError('Amount must be a nonnegative whole naira value.')
  return value
}
function bps(value){
  if(!Number.isSafeInteger(value)||value<0||value>10_000)
    throw new RangeError('Invalid fee basis points.')
  return value
}
export function percentageFee(amount,basisPoints){
  const n=naira(amount)
  // Round half up in whole naira, never above gross.
  return Math.floor((n*bps(basisPoints)+5000)/10_000)
}
export function gigQuote(amount,rateBps=GIG_FEE_BPS){
  const gross=naira(amount), fee=percentageFee(gross,rateBps)
  return {currency:'NGN',gigAmount:gross,platformFee:fee,
    clientTotal:gross,talentNet:gross-fee,feePayer:'talent',rateBps}
}
export function gigReleaseFee(totalGross,previouslyGrossReleased,releaseGross,rateBps=GIG_FEE_BPS){
  naira(totalGross);naira(previouslyGrossReleased);naira(releaseGross)
  if(previouslyGrossReleased+releaseGross>totalGross)throw new RangeError('Release exceeds escrow.')
  // Cumulative rounding ensures milestones and refunds align with the quoted fee.
  return percentageFee(previouslyGrossReleased+releaseGross,rateBps)-
    percentageFee(previouslyGrossReleased,rateBps)
}
export function salaryTrackingQuote(salary,method){
  const amount=naira(salary)
  if(amount===0)throw new RangeError('Enter a positive salary.')
  const fee=method==='bank_transfer'?SALARY_BANK_FEE_NGN
    :method==='cash'?SALARY_CASH_FEE_NGN
    :null
  if(fee===null)throw new RangeError('Salary escrow tracking requires an Admin-approved fixed monthly price.')
  return {currency:'NGN',salary:amount,method,trackingFee:fee,
    note:'Tracking service only: ChombuTar does not transfer or independently verify offline salary payments.'}
}
export function businessVerificationQuote(){
  return {currency:'NGN',verificationFee:BUSINESS_VERIFICATION_FEE_NGN,
    approval:'manual_review',automaticVerification:false}
}
