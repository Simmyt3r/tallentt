import test,{after,afterEach,beforeEach} from 'node:test'
import assert from 'node:assert/strict'
import {readFileSync} from 'node:fs'
import {
 cloudinaryLiveAvailability,cloudinaryLiveConfigured,createCloudinaryLive,
 getCloudinaryLive,idleCloudinaryLive,deleteCloudinaryLive,isAllowedCloudinaryHls,
} from '../api/_lib/cloudinaryLive.js'
import {resolveBroadcastAvailability} from '../api/_lib/liveTransport.js'
const names=['LIVE_VIDEO_PROVIDER','CLOUDINARY_URL','CLOUDINARY_CLOUD_NAME','CLOUDINARY_API_KEY',
 'CLOUDINARY_API_SECRET','LIVE_MEDIA_SERVER_URL','LIVE_WHIP_URL','LIVE_HLS_BASE_URL']
const old=Object.fromEntries(names.map(k=>[k,process.env[k]]))
const prevFetch=global.fetch
const calls=[]
const provider={id:'a'.repeat(32),name:'My Stream',
 input:{type:'rtmp',uri:'rtmp://live.cloudinary.com/streams',stream_key:'TOP_SECRET_KEY'},
 outputs:[{type:'hls',uri:'https://res.cloudinary.com/testcloud/video/live/live_stream_'+ 'a'.repeat(32)+'_hls.m3u8'}],
 status:'idle'}
beforeEach(()=>{
 calls.length=0
 for(const key of names)delete process.env[key]
 process.env.LIVE_VIDEO_PROVIDER='cloudinary'
 process.env.CLOUDINARY_CLOUD_NAME='testcloud'
 process.env.CLOUDINARY_API_KEY='mykey'
 process.env.CLOUDINARY_API_SECRET='mysecret'
 global.fetch=async(url,opts)=>{
  calls.push({url:String(url),opts})
  const data=opts.method==='GET'&&String(url).endsWith('/live_streams')
    ?[provider]:provider
  return {ok:true,status:200,json:async()=>({data})}
 }
})
afterEach(()=>{global.fetch=prevFetch})
after(()=>{for(const [k,v] of Object.entries(old)){if(v===undefined)delete process.env[k];else process.env[k]=v}})
test('Cloudinary Live requires server-side keys and a successful API check',async()=>{
 assert.equal(cloudinaryLiveConfigured(),true)
 const ready=await cloudinaryLiveAvailability()
 assert.equal(ready.ready,true)
 assert.equal(calls[0].url,'https://api.cloudinary.com/v2/video/testcloud/live_streams')
 assert.equal(calls[0].opts.headers.Authorization,'Basic '+Buffer.from('mykey:mysecret').toString('base64'))
 const availability=await resolveBroadcastAvailability()
 assert.equal(availability.mode,'cloudinary')
 assert.equal(availability.ready,true)
 delete process.env.CLOUDINARY_API_SECRET
 assert.equal(cloudinaryLiveConfigured(),false)
 assert.equal((await resolveBroadcastAvailability()).ready,false)
})
test('Live creates authenticated RTMP input and validated Cloudinary HLS output',async()=>{
 const result=await createCloudinaryLive('Singing practice')
 assert.equal(result.rtmpUrl,'rtmp://live.cloudinary.com/streams')
 assert.equal(result.streamKey,'TOP_SECRET_KEY')
 assert.equal(result.status,'idle')
 assert.match(result.hlsUrl,/\/video\/live\/live_stream_/)
 assert.equal(calls[0].opts.method,'POST')
 assert.deepEqual(JSON.parse(calls[0].opts.body),{
  name:'Singing practice',input:{type:'rtmp'},idle_timeout_sec:120,max_runtime_sec:10800,
 })
 assert.deepEqual((await getCloudinaryLive(provider.id)).id,provider.id)
 await idleCloudinaryLive(provider.id)
 await deleteCloudinaryLive(provider.id)
 assert.equal(calls.at(-2).opts.method,'POST')
 assert.equal(calls.at(-1).opts.method,'DELETE')
})
test('malicious HLS outputs and invalid provider responses are rejected',async()=>{
 assert.equal(isAllowedCloudinaryHls('https://evil.test/testcloud/video/live/x.m3u8','testcloud'),false)
 assert.equal(isAllowedCloudinaryHls('http://res.cloudinary.com/testcloud/video/live/x.m3u8','testcloud'),false)
 assert.equal(isAllowedCloudinaryHls('https://res.cloudinary.com/othercloud/video/live/x.m3u8','testcloud'),false)
 assert.equal(isAllowedCloudinaryHls(provider.outputs[0].uri,'testcloud'),true)
 global.fetch=async()=>({ok:true,json:async()=>({data:{...provider,outputs:[{type:'hls',uri:'https://evil.test/test.m3u8'}]}})})
 await assert.rejects(()=>createCloudinaryLive('Unsafe'),{status:502})
})
test('Cloudinary feature rejection does not falsely claim a ready broadcast',async()=>{
 global.fetch=async()=>({ok:false,status:403})
 const status=await cloudinaryLiveAvailability()
 assert.equal(status.ready,false)
 assert.equal(status.reason,'cloudinary_unavailable')
 assert.match(status.message,/not enabled|lack permission/)
})
test('host secrets are gated, live status comes from Cloudinary and stage playback uses verified HLS',()=>{
 const read=p=>readFileSync(new URL('../'+p,import.meta.url),'utf8')
 const live=read('api/_lib/live.js')
 const routes=read('api/live/index.js')
 const hub=read('src/pages/Live/LiveHub.jsx')
 const room=read('src/pages/Live/StageRoom.jsx')
 const stage=read('api/_lib/stageCompetitions.js')
 assert.match(live,/stream\.talent_id!==userId/)
 assert.match(live,/getCloudinaryLive\(room\.cloudinary_stream_id\)/)
 assert.match(live,/refreshCloudinaryLive\(streamId\)/)
 assert.match(live,/cloudinary_checked_at < NOW\(\)-INTERVAL '15 seconds'/)
 assert.match(live,/if\(stream\.cloudinary_stream_id\)throw liveError\(409,'Cloudinary broadcasts become live/)
 assert.match(live,/await idleCloudinaryLive\(upstream\[0\]\.cloudinary_stream_id\)/)
 assert.match(routes,/cloudinary_publisher/)
 assert.match(hub,/created\.media_mode==='cloudinary'/)
 assert.match(hub,/Create RTMP Live room/)
 assert.match(room,/Copy stream key/)
 assert.match(room,/api\.getCloudinaryPublisher\(id\)/)
 assert.match(stage,/cloudinary_hls_url/)
 assert.match(read('db/patch-cloudinary-live-2026-10.sql'),/cloudinary_stream_id/)
 assert.doesNotMatch(read('db/patch-cloudinary-live-2026-10.sql'),/stream_key/)
})
