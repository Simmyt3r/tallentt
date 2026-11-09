import test from 'node:test'
import assert from 'node:assert/strict'
import {splitAdvertisingRevenue,allocateEqualPool,simulateAdvertisingAllocation} from '../shared/adAllocation.js'

test('approved 60/28/12 example reconciles exactly',()=>{
  assert.deepEqual(splitAdvertisingRevenue(500000),{
    earned:'500000',platform:'300000',talent:'140000',explorer:'60000'
  })
})
test('all three pools sum to earned including indivisible amounts',()=>{
  for(const n of [0,1,2,3,7,11,97,1001,500001,99999999999999n]){
    const r=splitAdvertisingRevenue(n)
    assert.equal(BigInt(r.platform)+BigInt(r.talent)+BigInt(r.explorer),BigInt(n))
  }
})
test('variable Explorer amounts and low-Talent inventory have no fabricated recipients',()=>{
  const x=simulateAdvertisingAllocation({earnedNa:500000,
    talentIds:Array.from({length:40},(_,i)=>'talent-'+i),
    explorerIds:Array.from({length:400},(_,i)=>'explorer-'+i)})
  assert.equal(x.talent.allocations.length,40)
  assert.equal(x.talent.allocations[0].amount,'3500')
  assert.equal(x.explorer.allocations.length,400)
  assert.equal(x.explorer.allocations[0].amount,'150')
})
test('unallocated pool remains outstanding with no qualified Discoverers',()=>{
  assert.deepEqual(allocateEqualPool(60,[]),{allocations:[],unallocated:'60'})
})
test('rounding is deterministic and preserves sums',()=>{
  const result=allocateEqualPool(10,['z','a','c'])
  assert.deepEqual(result.allocations,[{recipientId:'a',amount:'4'},
    {recipientId:'c',amount:'3'},{recipientId:'z',amount:'3'}])
})
test('rejects duplicate identities, invalid splits and non-integer amounts',()=>{
  assert.throws(()=>allocateEqualPool(10,['a','a']),/Duplicate/)
  assert.throws(()=>splitAdvertisingRevenue(500,{platform:8000,talent:2000,explorer:1200}),/10000/)
  assert.throws(()=>splitAdvertisingRevenue(9.5),/integer/)
  assert.throws(()=>allocateEqualPool(-1,['a']),/negative/)
})
