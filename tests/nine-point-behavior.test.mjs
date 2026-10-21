import test from 'node:test'
import assert from 'node:assert/strict'
// Stub the optional pooled database before importing its wrapper.
global.__tworldPool={query:async()=>{throw new Error('Database should not be called during invalid input checks.')}}
const {financeLiabilityAudit}=await import('../api/_lib/financeReporting.js')
import {resolveLiveMediaAvailability} from '../api/_lib/liveMedia.js'

// The test runner starts this file in an isolated process. No real database,
// Paystack account or customer's balance is ever mutated by these checks.
const mediaVars=['LIVE_MEDIA_SERVER_URL','LIVE_WHIP_URL','LIVE_HLS_BASE_URL']
const originalEnv=Object.fromEntries(mediaVars.map(x=>[x,process.env[x]]))
const originalFetch=global.fetch

test.after(()=>{
  global.fetch=originalFetch
  for(const key of mediaVars){if(originalEnv[key]===undefined)delete process.env[key];else process.env[key]=originalEnv[key]}
})
const setupMedia=()=>{
  process.env.LIVE_MEDIA_SERVER_URL='https://media.example.test/health'
  process.env.LIVE_WHIP_URL='https://media.example.test'
  process.env.LIVE_HLS_BASE_URL='https://media.example.test'
}

test('Live health does not treat HTTP 404 or HTML login as a ready broadcast',async()=>{
  setupMedia()
  global.fetch=async()=>({ok:false,status:404,headers:{get:()=>null}})
  assert.deepEqual(await resolveLiveMediaAvailability(),{
    mode:'fallback',reason:'health_http_error',healthStatus:404})
  global.fetch=async()=>({ok:true,status:200,headers:{get:()=> 'text/html'}})
  assert.deepEqual(await resolveLiveMediaAvailability(),{
    mode:'fallback',reason:'unexpected_health_response'})
  global.fetch=async()=>({ok:true,status:200,headers:{get:()=> 'application/json'}})
  assert.deepEqual(await resolveLiveMediaAvailability(),{
    mode:'mediamtx',reason:null})
})

test('liability audit rejects unknown types and invalid cursors before querying',async()=>{
  await assert.rejects(financeLiabilityAudit({kind:'owners_profit'}),/Unknown liability/)
  await assert.rejects(financeLiabilityAudit({kind:'escrow',cursor:'oops'}),/Invalid liability/)
})
