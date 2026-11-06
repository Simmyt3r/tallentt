import {chromium} from 'playwright'
import {preview} from 'vite'
import {fileURLToPath} from 'node:url'
import {readFile,mkdir} from 'node:fs/promises'
import assert from 'node:assert/strict'
import {closePreview} from './preview-server.mjs'
import {optOutPageToursForFixture} from './page-tour-fixture.mjs'

process.env.LIVE_VIDEO_PROVIDER='platform'
await global.__tworldPool.query(await readFile(new URL('../db/live-support.sql',import.meta.url),'utf8'))
await global.__tworldPool.query(await readFile(new URL('../db/patch-wallet-peer-transfers-2026-11.sql',import.meta.url),'utf8'))
await global.__tworldPool.query(await readFile(new URL('../db/patch-monetization-2026-10.sql',import.meta.url),'utf8'))
await global.__tworldPool.query("UPDATE users SET is_admin=false,role=CASE WHEN username='studio_client' THEN 'client' ELSE 'talent' END")
const vite=await preview({root:fileURLToPath(new URL('..',import.meta.url)),
  preview:{host:'127.0.0.1',port:5179,strictPort:true,proxy:{'/api':'http://127.0.0.1:3000'}}})
let browser
const errors=[]
try{
  browser=await chromium.launch({headless:true,executablePath:process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH||undefined,
    args:['--use-fake-device-for-media-stream','--use-fake-ui-for-media-stream','--autoplay-policy=no-user-gesture-required']})
  const hostContext=await browser.newContext({viewport:{width:390,height:844},permissions:['camera','microphone']})
  const viewerContext=await browser.newContext({viewport:{width:1440,height:1000}})
  for(const context of [hostContext,viewerContext])await optOutPageToursForFixture(context)
  const host=await hostContext.newPage(),viewer=await viewerContext.newPage()
  const anonymous=await browser.newContext()
  assert.equal((await anonymous.request.get('http://127.0.0.1:5179/api/live?media_manifest=11111111-1111-4111-8111-111111111111')).status(),401)
  await anonymous.close()
  for(const [page,role] of [[host,'talent'],[viewer,'client']]){
    page.on('pageerror',error=>errors.push(error.message))
    await page.goto(`http://127.0.0.1:5179/api/__test/session?role=${role}`)
    assert.equal((await page.request.get('http://127.0.0.1:5179/api/admin')).status(),403)
    await page.goto('http://127.0.0.1:5179/live')
    await page.getByText(/Viewers receive video and sound with a short delay/).waitFor()
    assert.equal(await page.getByRole('link',{name:'Admin',exact:true}).count(),0)
  }
  // Full app, real API, real MediaRecorder/video decoding; no media provider,
  // stubbed player, mocked upload, or admin permission is used in this journey.
  await host.getByRole('button',{name:'Go Live from camera',exact:true}).click()
  await host.getByPlaceholder('Live title',{exact:true}).fill('Camera broadcast test')
  await host.getByRole('button',{name:'Start Live',exact:true}).click()
  await host.waitForURL(/\/live\/stage\//,{timeout:30000})
  const url=host.url(),id=url.split('/').at(-1)
  await viewer.goto(url)
  await viewer.getByRole('region',{name:'Live video player',exact:true}).waitFor()
  const video=viewer.getByLabel('Live video',{exact:true})
  await viewer.waitForFunction(()=>{
    const v=document.querySelector('video[aria-label="Live video"]')
    return v&&v.videoWidth>0&&v.currentTime>0.25&&!v.paused
  },{timeout:20000})
  const initial=Number(await video.getAttribute('data-sequence'))
  await viewer.waitForFunction(previous=>Number(document.querySelector('video[aria-label="Live video"]')?.dataset.sequence)>previous+1,initial,{timeout:20000})
  await viewer.getByRole('button',{name:'Enable sound',exact:true}).click()
  assert.equal(await video.evaluate(el=>el.muted),false)
  await viewer.waitForFunction(()=>document.querySelector('video[aria-label="Live video"]')?.webkitAudioDecodedByteCount>0)
  const manifest=await viewer.request.get(`http://127.0.0.1:5179/api/live?media_manifest=${id}`)
  const data=await manifest.json()
  assert.equal(data.status,'live');assert.ok(data.segments.length>=3)
  for(const width of [320,390,768,1440]){
    await viewer.setViewportSize({width,height:900})
    assert.equal(await viewer.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true,`Live overflow at ${width}`)
  }
  await mkdir('test-results',{recursive:true})
  await viewer.screenshot({path:'test-results/platform-live-viewer.png',fullPage:true})
  host.on('dialog',dialog=>dialog.accept())
  await host.getByRole('button',{name:'End Live',exact:true}).click()
  await host.getByText('Live has ended',{exact:true}).waitFor()
  assert.equal((await viewer.request.get(`http://127.0.0.1:5179/api/live?media_segment=${id}&sequence=1`)).status(),404)
  assert.equal((await global.__tworldPool.query('SELECT * FROM live_video_segments WHERE stream_id=$1',[id])).rows.length,0)
  await global.__tworldPool.query(`INSERT INTO wallet_transactions(user_id,type,amount,balance_after,status,reference,escrow_id)
    VALUES('11111111-1111-4111-8111-111111111111','billing_charge',500,39500,'success','ui-service-charge','55555555-5555-4555-8555-555555555555')`)
  await viewer.goto('http://127.0.0.1:5179/wallet')
  await viewer.getByText('Service charge',{exact:true}).waitFor()
  await viewer.getByRole('listitem').filter({hasText:'Service charge'}).getByRole('link',{name:'View deal',exact:true}).waitFor()
  assert.doesNotMatch(await viewer.locator('body').innerText(),/billing_charge/)
  assert.deepEqual(errors,[])
  console.log('Non-admin camera host → separate viewer: real video playback across segments, sound, responsive layouts, admin denial and End Live cleanup passed.')
}catch(error){
  for(const page of browser?.contexts().flatMap(c=>c.pages())||[])console.error(page.url(),(await page.locator('body').innerText()).slice(-5000))
  throw error
}finally{await browser?.close();await new Promise(resolve=>vite.httpServer.close(resolve));await closePreview()}
