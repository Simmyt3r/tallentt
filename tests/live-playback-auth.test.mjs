import test,{before} from 'node:test'
import assert from 'node:assert/strict'
import {createHash} from 'node:crypto'
const stream='live-11111111-1111-4111-8111-111111111111'
let status='live'
let writes=0
const token='publisher-secret'
global.__tworldPool={query:async(sql)=>{
 if(sql.includes('SELECT id,status,publish_token_hash FROM live_streams')){
   return {rows:[{id:'11111111-1111-4111-8111-111111111111',status,
     publish_token_hash:createHash('sha256').update(token).digest('hex')}]}
 }
 if(sql.includes("UPDATE live_streams SET media_status='connecting'")){writes++;return {rowCount:1}}
 throw Error('Unexpected media auth query: '+sql)
}}
const {authorizeMediaPublish}=await import('../api/_lib/live.js')
test('active HLS viewers can watch without a publish token',async()=>{
 status='live'
 assert.equal(await authorizeMediaPublish({action:'read',protocol:'hls',path:stream}),true)
 assert.equal(await authorizeMediaPublish({action:'playback',protocol:'hls',path:stream}),true)
 assert.equal(writes,0)
})
test('ended rooms and path spoofing cannot be read',async()=>{
 status='ended'
 assert.equal(await authorizeMediaPublish({action:'read',protocol:'hls',path:stream}),false)
 status='live'
 assert.equal(await authorizeMediaPublish({action:'read',protocol:'hls',path:'other'}),false)
})
test('public HLS authorization does not permit publishing',async()=>{
 status='starting'
 assert.equal(await authorizeMediaPublish({action:'publish',protocol:'webrtc',path:stream,token:'incorrect'}),false)
 assert.equal(await authorizeMediaPublish({action:'publish',protocol:'hls',path:stream,token}),false)
 assert.equal(await authorizeMediaPublish({action:'publish',protocol:'webrtc',path:stream,token}),true)
 assert.equal(writes,1)
})
