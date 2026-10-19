import test from 'node:test'
import assert from 'node:assert/strict'
import {providerVerdict,unsafeVisionResult} from '../api/_lib/vibesModeration.js'

test('AI provider decisions must all clear before automatic publication',()=>{
  assert.equal(providerVerdict(undefined),'unconfigured')
  assert.equal(providerVerdict([]),'unconfigured')
  assert.equal(providerVerdict([{status:'approved'}]),'approved')
  assert.equal(providerVerdict([{status:'approved'},{status:'approved'}]),'approved')
  assert.equal(providerVerdict([{status:'approved'},{status:'pending'}]),'pending')
  assert.equal(providerVerdict([{status:'approved'},{status:'rejected'}]),'review')
  assert.equal(providerVerdict([{status:'unknown'}]),'pending')
  assert.equal(providerVerdict([{}]),'pending')
})
test('Vision labels flag adult, violence, or sexualized images, fail closed for absent analysis',()=>{
  assert.equal(unsafeVisionResult(null),true)
  assert.equal(unsafeVisionResult({adult:'VERY_UNLIKELY',violence:'UNLIKELY',racy:'UNLIKELY'}),false)
  assert.equal(unsafeVisionResult({adult:'LIKELY',violence:'VERY_UNLIKELY',racy:'UNLIKELY'}),true)
  assert.equal(unsafeVisionResult({adult:'UNLIKELY',violence:'VERY_LIKELY',racy:'UNLIKELY'}),true)
  assert.equal(unsafeVisionResult({adult:'UNLIKELY',violence:'UNLIKELY',racy:'LIKELY'}),true)
})
