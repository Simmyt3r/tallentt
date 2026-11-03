import test,{beforeEach,after} from 'node:test'
import assert from 'node:assert/strict'
import jwt from 'jsonwebtoken'
import {readFileSync} from 'node:fs'
import {
  livekitConfigured,livekitAvailability,livekitRoomName,isLivekitStream,
  livekitJoinCredentials,createLivekitRoom,livekitHostPublishing,deleteLivekitRoom,
} from '../api/_lib/livekitCloud.js'
import {resolveBroadcastAvailability} from '../api/_lib/liveTransport.js'

const originalFetch=global.fetch
const names=['LIVE_VIDEO_PROVIDER','LIVEKIT_URL','LIVEKIT_API_KEY','LIVEKIT_API_SECRET',
  'LIVE_MEDIA_SERVER_URL','LIVE_WHIP_URL','LIVE_HLS_BASE_URL']
const saved=Object.fromEntries(names.map(name=>[name,process.env[name]]))
const read=path=>readFileSync(new URL('../'+path,import.meta.url),'utf8')
const hostId='11111111-1111-4111-8111-111111111111'
const viewerId='22222222-2222-4222-8222-222222222222'
const stream=livekitRoomName('33333333-3333-4333-8333-333333333333')
const secret='only-a-test-secret-must-never-be-used-in-production'
beforeEach(()=>{
  for(const name of names)delete process.env[name]
  global.fetch=originalFetch
})
after(()=>{
  global.fetch=originalFetch
  for(const name of names){
    if(saved[name]===undefined)delete process.env[name]
    else process.env[name]=saved[name]
  }
})
function setup(){
  process.env.LIVE_VIDEO_PROVIDER='livekit'
  process.env.LIVEKIT_URL='wss://test-project.livekit.cloud'
  process.env.LIVEKIT_API_KEY='API_TESTING_12345678'
  process.env.LIVEKIT_API_SECRET=secret
}

test('LiveKit requires complete server-only configuration and reports unconfigured safely',async()=>{
  assert.equal(livekitConfigured(),false)
  assert.deepEqual(await resolveBroadcastAvailability(),{
    mode:'fallback',ready:false,reason:'livekit_unconfigured',
  })
  process.env.LIVEKIT_URL='https://unsecured.test'
  process.env.LIVEKIT_API_KEY='API_TESTING_12345678'
  process.env.LIVEKIT_API_SECRET=secret
  assert.equal(livekitConfigured(),false)
})

test('LiveKit signs owner-only publish tokens and viewer subscribe-only tokens',()=>{
  setup()
  const owner=livekitJoinCredentials({room:stream,userId:hostId,publisher:true})
  const viewer=livekitJoinCredentials({room:stream,userId:viewerId,publisher:false})
  assert.equal(owner.url,'wss://test-project.livekit.cloud')
  const hostPayload=jwt.verify(owner.token,secret,{algorithms:['HS256'],issuer:'API_TESTING_12345678'})
  const viewerPayload=jwt.verify(viewer.token,secret,{algorithms:['HS256'],issuer:'API_TESTING_12345678'})
  assert.equal(hostPayload.sub,hostId)
  assert.equal(hostPayload.video.room,stream)
  assert.equal(hostPayload.video.roomJoin,true)
  assert.equal(hostPayload.video.canPublish,true)
  assert.equal(hostPayload.video.canPublishData,false)
  assert.deepEqual(hostPayload.video.canPublishSources,['camera','microphone'])
  assert.equal(viewerPayload.sub,viewerId)
  assert.equal(viewerPayload.video.canPublish,false)
  assert.equal(viewerPayload.video.canSubscribe,true)
  assert.equal(viewerPayload.video.canPublishData,false)
  assert.equal(viewerPayload.video.canPublishSources,undefined)
  assert.throws(()=>livekitJoinCredentials({room:'other-room',userId:hostId,publisher:true}),{status:400})
  assert.equal(isLivekitStream({stream_path:stream}),true)
  assert.equal(isLivekitStream({stream_path:'live-33333333-3333-4333-8333-333333333333'}),false)
})

test('LiveKit readiness checks authenticated API and remote host tracks before claiming LIVE',async()=>{
  setup()
  const calls=[]
  global.fetch=async(url,options)=>{
    const method=String(url).split('/').at(-1)
    calls.push({method,body:JSON.parse(options.body),token:options.headers.Authorization.slice(7)})
    const data=method==='ListRooms'?{rooms:[]}
      :method==='GetParticipant'?{identity:hostId,tracks:[{type:'VIDEO'}]}
      :method==='CreateRoom'?{name:stream}:{}
    return {ok:true,status:200,json:async()=>data}
  }
  assert.deepEqual(await resolveBroadcastAvailability(),{mode:'livekit',ready:true,reason:null,message:undefined})
  await createLivekitRoom(stream)
  assert.equal(await livekitHostPublishing(stream,hostId),true)
  await deleteLivekitRoom(stream)
  assert.deepEqual(calls.map(c=>c.method),['ListRooms','CreateRoom','GetParticipant','DeleteRoom'])
  assert.deepEqual(calls[1].body,{name:stream,emptyTimeout:120,departureTimeout:60,maxParticipants:100})
  const grant=jwt.verify(calls[2].token,secret)
  assert.equal(grant.video.roomAdmin,true)
  assert.equal(grant.video.room,stream)
  assert.equal(grant.video.roomJoin,undefined)
  assert.equal(grant.video.canPublish,undefined)
})

test('Remote 404 means host is not transmitting, but invalid credentials are not treated as ready',async()=>{
  setup()
  global.fetch=async()=>({ok:false,status:404})
  assert.equal(await livekitHostPublishing(stream,hostId),false)
  global.fetch=async()=>({ok:false,status:403})
  const status=await livekitAvailability()
  assert.equal(status.ready,false)
  assert.equal(status.reason,'livekit_unavailable')
  assert.match(status.message,/credentials/)
})

test('LiveKit routes and media paths are guarded by authenticated subscriber ownership',()=>{
  const live=read('api/_lib/live.js')
  const route=read('api/live/index.js')
  const hub=read('src/pages/Live/LiveHub.jsx')
  const stage=read('src/pages/Live/StageRoom.jsx')
  const player=read('src/pages/Live/LiveKitStage.jsx')
  assert.match(route,/getSessionUser\(req\)/)
  assert.match(route,/livekit_token/)
  assert.match(route,/getLivekitParticipantCredentials\(session\.sub/)
  assert.match(live,/const publisher=room\.talent_id===userId/)
  assert.match(live,/if\(!publisher&&!\['live','reconnecting'\]\.includes\(room\.status\)\)/)
  assert.match(live,/livekitHostPublishing\(stream\.stream_path,userId\)/)
  assert.match(live,/deleteLivekitRoom\(upstream\[0\]\.stream_path\)/)
  assert.match(hub,/startLivekitBroadcast/)
  assert.match(hub,/created\.media_mode==='livekit'/)
  assert.match(stage,/LiveKitStage/)
  assert.match(player,/api\.getLivekitToken\(id\)/)
  assert.match(player,/Tap to enable sound/)
  assert.match(read('.env.example'),/^LIVE_VIDEO_PROVIDER=livekit$/m)
  assert.doesNotMatch(read('.env.example'),/LIVEKIT_API_SECRET=only-a-test-secret/)
})
