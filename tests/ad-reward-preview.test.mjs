import test from 'node:test'
import assert from 'node:assert/strict'
import {eligibleDiscoverySlots,distributeExplorerSlots,simulateVerifiedRewards} from '../shared/adRewardPreview.js'

const source=(talentId,discovererId,sourceId,createdAt='2026-10-05T00:00:00Z')=>
  ({talentId,discovererId,sourceId,createdAt})

test('only ten earliest verified Discoverer slots are used per selected Talent',()=>{
  const evidence=Array.from({length:12},(_,i)=>source('talent-a','viewer-'+String(i).padStart(2,'0'),'proof-'+i,
    '2026-10-'+String(i+1).padStart(2,'0')+'T00:00:00Z'))
  evidence.reverse()
  const slots=eligibleDiscoverySlots(['talent-a'],evidence)
  assert.equal(slots.length,10)
  assert.equal(slots[0].discovererId,'viewer-00')
  assert.equal(slots.at(-1).discovererId,'viewer-09')
})
test('one Explorer can earn multiple candidate slots for different Talents',()=>{
  const e=[source('talent-b','viewer-a','proof-b'),source('talent-a','viewer-a','proof-a'),
    source('talent-a','viewer-c','proof-c')]
  const r=simulateVerifiedRewards({earnedNa:500000,selectedTalentIds:['talent-a','talent-b'],
    verifiedDiscoveryEvidence:e})
  assert.equal(r.pools.platform,'300000')
  assert.equal(r.pools.talent,'140000')
  assert.equal(r.pools.explorer,'60000')
  assert.deepEqual(r.talent.allocations.map(x=>x.amount),['70000','70000'])
  assert.equal(r.explorer.slots.length,3)
  assert.deepEqual(r.explorer.recipients,[{recipientId:'viewer-a',amountNa:'40000'},
    {recipientId:'viewer-c',amountNa:'20000'}])
  assert.equal(r.disbursementEnabled,false)
  assert.equal(r.approvedForPayment,false)
})
test('self-discovery, duplicates and nonselected Talents are excluded',()=>{
  const evidence=[
    source('talent-a','talent-a','self'),
    source('talent-x','viewer-x','not-selected'),
    source('talent-a','viewer-a','d1'),
    source('talent-a','viewer-a','d2'),
    source('talent-a','viewer-b','d1'),
  ]
  const r=eligibleDiscoverySlots(['talent-a'],evidence)
  assert.deepEqual(r.map(x=>x.sourceId),['d1'])
})
test('unallocated Explorer funds remain unmatched when no verified Discoverer exists',()=>{
  const r=simulateVerifiedRewards({earnedNa:500000,selectedTalentIds:['talent-a'],
    verifiedDiscoveryEvidence:[]})
  assert.equal(r.explorer.unallocated,'60000')
  assert.equal(r.explorer.recipients.length,0)
  assert.equal(r.talent.allocations[0].amount,'140000')
})
test('rounding with repeated Discoverers remains exact and deterministic',()=>{
  const rows=[source('a','u1','1'),source('b','u1','2'),source('b','u2','3')]
  const d=distributeExplorerSlots(7,rows)
  assert.deepEqual(d.slots.map(x=>x.amountNa),['3','2','2'])
  assert.equal(d.recipients.reduce((t,r)=>t+BigInt(r.amountNa),0n),7n)
})
test('invalid or duplicate recipients cannot be silently paid',()=>{
  assert.throws(()=>eligibleDiscoverySlots(['a','a'],[]),/Duplicate/)
  assert.throws(()=>eligibleDiscoverySlots(['a'],[source('a','u','x','not-a-date')]),/Invalid/)
  assert.throws(()=>distributeExplorerSlots(10,[source('a','b','1'),source('a','b','2')]),/Duplicate/)
  assert.throws(()=>simulateVerifiedRewards({earnedNa:-1,selectedTalentIds:[],verifiedDiscoveryEvidence:[]}))
})
