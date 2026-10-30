import test from 'node:test'
import assert from 'node:assert/strict'
import {gigQuote,gigReleaseFee,salaryTrackingQuote,percentageFee,businessVerificationQuote,
 TALENT_PLANS,CLIENT_PLANS} from '../shared/monetization.js'

test('₦50,000 gig costs client ₦50,000 and pays talent ₦47,500',()=>{
  assert.deepEqual(gigQuote(50000),{currency:'NGN',gigAmount:50000,
    platformFee:2500,clientTotal:50000,talentNet:47500,feePayer:'talent',rateBps:500})
  assert.equal(gigReleaseFee(50000,0,15000),750)
  assert.equal(gigReleaseFee(50000,15000,35000),1750)
  assert.equal(750+1750,2500)
})
test('small gigs round consistently across milestone releases and partial refunds',()=>{
  for(const total of [1,2,3,10,101,999,4999,200000]){
    const start=Math.floor(total*0.3)
    const finish=total-start
    assert.equal(gigReleaseFee(total,0,start)+gigReleaseFee(total,start,finish),percentageFee(total,500))
    assert.equal(gigReleaseFee(total,0,start),percentageFee(start,500))
  }
  assert.equal(gigReleaseFee(10000,0,3000),150)
})
test('salary tracking quotes distinguish bank, cash and escrow and never imply bank verification',()=>{
  assert.equal(salaryTrackingQuote(50000,'bank_transfer').trackingFee,1000)
  assert.equal(salaryTrackingQuote(50000,'cash').trackingFee,500)
  assert.equal(salaryTrackingQuote(50000,'escrow').trackingFee,1000)
  assert.match(salaryTrackingQuote(50000,'cash').note,/does not transfer or verify/i)
})
test('verification requires a review; no unapproved subscription price is invented',()=>{
  assert.equal(businessVerificationQuote().verificationFee,3000)
  assert.equal(businessVerificationQuote().automaticVerification,false)
  assert.deepEqual(TALENT_PLANS.map(x=>x.name),['Free','Green Pro','Black Vaulted'])
  assert.deepEqual(CLIENT_PLANS.map(x=>x.name),['Free','Business','Enterprise'])
  assert.equal(TALENT_PLANS[1].amountNaira,null)
  assert.equal(CLIENT_PLANS[1].available,false)
})
test('invalid money, negative values and invalid payment method fail closed',()=>{
  for(const n of [-1,NaN,Infinity,0.5,2_147_483_648])assert.throws(()=>gigQuote(n))
  assert.throws(()=>salaryTrackingQuote(50000,'cryptocurrency'))
})
