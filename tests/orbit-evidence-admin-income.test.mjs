import test from 'node:test'
import assert from 'node:assert/strict'
import {readFileSync} from 'node:fs'
import {summarizeRecordedIncome} from '../api/_lib/financeReporting.js'
import {calculateOrbitScore} from '../api/_lib/accountOrbit.js'
import {fullOrbitScore} from '../src/lib/profileScore.js'
const read=path=>readFileSync(new URL('../'+path,import.meta.url),'utf8')

test('Admin income categories sum recorded charges once, while separating earned from pending',()=>{
 const streams=[
   {id:'deal_fees',verb:'Book',recorded:true,inflow:'650',recognition:'earned'},
   {id:'live_support',verb:'Live',recorded:true,inflow:'200',recognition:'earned'},
   {id:'salary_tracking',verb:'Hire',recorded:true,inflow:'500',recognition:'pending'},
   {id:'salary_tracking_talent',verb:'Hire',recorded:true,inflow:'500',recognition:'pending'},
   {id:'subscription',recorded:true,inflow:'1200',recognition:'pending'},
   {id:'business_verification',recorded:true,inflow:'0',recognition:'pending'},
   {id:'sponsor_fees',verb:'Sponsor',recorded:false,inflow:null,recognition:'pending'},
   {id:'collab_fees',verb:'Collab',recorded:false,inflow:null,recognition:'pending'},
 ]
 const total=summarizeRecordedIncome(streams)
 assert.equal(total.recorded_fee_charges,'3050')
 assert.equal(total.earned_revenue,'850')
 assert.equal(total.pending_recognition,'2200')
 assert.equal(total.recorded_categories,6)
 assert.deepEqual(total.unavailable_categories,['sponsor_fees','collab_fees'])
 assert.equal(total.partial,true)
})

test('Missing source does not become zero recorded earnings or a fabricated total',()=>{
 const unknown=summarizeRecordedIncome([
  {id:'collab_fees',recorded:false,inflow:null},
  {id:'sponsor_fees',recorded:false,inflow:null},
 ])
 assert.equal(unknown.recorded_fee_charges,null)
 assert.equal(unknown.earned_revenue,null)
 assert.equal(unknown.pending_recognition,null)
 const empty=summarizeRecordedIncome([
  {id:'deal_fees',recorded:true,inflow:'0',recognition:'earned'},
 ])
 assert.equal(empty.recorded_fee_charges,'0')
 assert.equal(empty.earned_revenue,'0')
 assert.equal(empty.pending_recognition,null)
})

test('Refund reversals reduce net recorded service charges, not gross customer escrow',()=>{
 const total=summarizeRecordedIncome([
  {id:'deal_fees',recorded:true,inflow:'150',recognition:'earned'},
  {id:'live_support',recorded:true,inflow:'10',recognition:'earned'},
  {id:'sponsor_fees',recorded:false,inflow:null},
 ])
 assert.equal(total.recorded_fee_charges,'160')
 assert.equal(total.earned_revenue,'160')
 assert.ok(!read('api/_lib/financeReporting.js').includes('wallet_liability,0)::text AS income'))
})

test('Orbit evidence separates verified completed transactions from publishing and account history',()=>{
 const result=calculateOrbitScore({
  completedProfileFields:5,verifiedIdentity:true,completedWork:10,
  successfulHires:4,activeDays:10,accountAgeDays:365
 })
 assert.ok(result.evidence.verified_work.points>0)
 assert.ok(result.evidence.showcase_activity.points>0)
 assert.ok(result.evidence.profile_history.points>0)
 assert.deepEqual(result.byRole.talent.evidence.verified_work.factors,['completed_work'])
 assert.deepEqual(result.byRole.client.evidence.verified_work.factors,['successful_hires'])
 assert.equal(result.byRole.talent.evidence.verified_work.points,
   result.byRole.talent.factors.find(f=>f.key==='completed_work').earned)
 assert.equal(result.byRole.client.evidence.verified_work.points,
   result.byRole.client.factors.find(f=>f.key==='successful_hires').earned)
 assert.equal(result.evidence.verified_work.points,
   result.byRole.talent.evidence.verified_work.points+result.byRole.client.evidence.verified_work.points)
 assert.equal(fullOrbitScore(result.score),result.score.toFixed(1))
})

test('Admin ledger presents per-category income before separate totals and retains liabilities',()=>{
 const ledger=read('src/components/AdminFinanceLedger.jsx')
 const accounting=read('api/_lib/financeReporting.js')
 assert.match(accounting,/income_streams:incomeStreams/)
 assert.match(accounting,/income_totals:incomeTotals/)
 for(const verb of ['Book','Hire','Collab','Sponsor'])assert.ok(accounting.includes("verb:'"+verb+"'")||accounting.includes("'"+verb+"')"))
 assert.match(ledger,/Platform income totals/)
 assert.ok(ledger.indexOf('streams.map(item')<ledger.indexOf('Platform income totals'))
 assert.match(ledger,/recorded_fee_charges/)
 assert.match(ledger,/earned_revenue/)
 assert.match(ledger,/pending_recognition/)
 assert.match(ledger,/Customer and escrow liabilities/)
 assert.match(ledger,/amount unknown \(not zero\)/)
})
