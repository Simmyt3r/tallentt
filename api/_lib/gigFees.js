import { gigReleaseFee } from '../../shared/monetization.js'

// Called within an already-open escrow row lock and transaction, before the
// talent wallet receives a release. Previously funded deals have NULL fee
// terms and remain fee-free; funding freezes the terms for every new deal.
export async function bookGigRelease(client,escrow,{stage,gross,previousGross=0}){
  if(!Number.isSafeInteger(gross)||gross<0||!Number.isSafeInteger(previousGross)||previousGross<0)
    throw new RangeError('Invalid escrow release amounts.')
  const rate=escrow.gig_fee_bps==null?0:Number(escrow.gig_fee_bps)
  const fee=gigReleaseFee(Number(escrow.amount),previousGross,gross,rate)
  const net=gross-fee
  if(fee>0 && escrow.gig_fee_sealed!==true){
    await client.query(`INSERT INTO gig_fee_events
      (escrow_id,stage,gross_released,fee_amount,rate_bps)
      VALUES($1,$2,$3,$4,$5)`,[escrow.id,stage,gross,fee,rate])
  }
  return {gross,fee,net,rateBps:rate}
}
