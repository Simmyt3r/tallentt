// Dedicated Playwright integration check: responsive Top 12 and encoded video
// output with signed QR and audio (not merely an ephemeral CSS overlay).
import assert from 'node:assert/strict'
import { chromium } from 'playwright'
import { createServer } from 'vite'
import { fileURLToPath } from 'node:url'
import { mkdir, readFile } from 'node:fs/promises'
import { execFileSync } from 'node:child_process'
import { optOutPageToursForFixture } from './page-tour-fixture.mjs'

const root=fileURLToPath(new URL('..',import.meta.url))
const port=5187
const vite=await createServer({root,server:{host:'127.0.0.1',port,strictPort:true}})
let browser
await mkdir('test-results',{recursive:true})
const sourceFile='test-results/work-pass-source.mp4'
execFileSync('ffmpeg',['-nostdin','-loglevel','error','-y',
  '-f','lavfi','-i','color=c=royalblue:s=480x480:r=24:d=2',
  '-f','lavfi','-i','sine=frequency=440:duration=2',
  '-shortest','-c:v','libx264','-pix_fmt','yuv420p',
  '-c:a','aac','-movflags','+faststart',sourceFile])
const clip=await readFile(sourceFile)
try{
  await vite.listen()
  browser=await chromium.launch({headless:true,
    executablePath:process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH||undefined})
  for(const width of [390,1280]){
    const context=await browser.newContext({viewport:{width,height:850},acceptDownloads:true})
    await optOutPageToursForFixture(context)
    const page=await context.newPage()
    page.setDefaultTimeout(20000)
    const pageErrors=[]
    page.on('pageerror',error=>pageErrors.push(error.message))
    let topRequests=0
    const user={id:'11111111-1111-4111-8111-111111111111',
      username:'studio',fullName:'Studio',role:'talent',isAdmin:false}
    const hat={id:'22222222-2222-4222-8222-222222222222',user_id:user.id,
      username:'studio',owner_full_name:'Studio',hat_title:'Verified event videography',
      hat_name:'Event video',role:'talent',category:'Film',active:true,
      work_pass_tier:'Gold',work_pass_orbit:76,top12_rank:1,
      is_entertainment:false,likes:0,views:0,media:[{
        id:'33333333-3333-4333-8333-333333333333',
        type:'image',url:'data:image/svg+xml,<svg xmlns="http://www.w3.org/2000/svg"/>',
        caption:'Event videography',screening_status:'passed',
      }]}
    const qrPayload='CTWP1.test.'+Buffer.from(JSON.stringify({
      username:'studio',tier:'Gold',expiresAt:Math.floor(Date.now()/1000)+3600,
    })).toString('base64url')+'.'+Buffer.from('test-signed-claim').toString('base64url')
    await page.route('**/fixture-video.mp4',route=>route.fulfill({
      status:200,contentType:'video/mp4',
      headers:{'access-control-allow-origin':'*','accept-ranges':'bytes'},body:clip,
    }))
    await page.route('**/api/**',route=>{
      const url=new URL(route.request().url())
      const action=url.searchParams.get('action')
      const send=body=>route.fulfill({status:200,contentType:'application/json',body:JSON.stringify(body)})
      if(url.pathname==='/api/auth'){
        if(action==='work_pass')return send({token:qrPayload,signatureStatus:'signed',tier:'Gold',
          user:{username:'studio',name:'Studio Designer',role:'talent',headline:'Visual storyteller',skills:['Photography','Editing']},
          completedJobs:12,successfulHires:3,orbit:76,evidence:[],endorsements:[],robots:[]})
        if(action==='me'||!action)return send({user})
        return send({count:0,notifications:[],user})
      }
      if(url.pathname==='/api/showroom'){
        if(url.searchParams.get('view')==='top12'){topRequests++;return send({
          hats:[hat],view:'top12',galleryPosts:[],nextCursor:null,
          galleryNextCursor:null,categories:[],
        })}
        return send({hats:[],galleryPosts:[],nextCursor:null,categories:[]})
      }
      if(url.pathname==='/api/escrows')return send({conversations:[],nextCursor:null,counts:{}})
      if(url.pathname==='/api/hats')return send({hats:[]})
      return send({hats:[],items:[],notifications:[],count:0})
    })
    await page.goto('http://127.0.0.1:'+port+'/showroom')
    const top=page.getByRole('button',{name:/Top 12/})
    await top.waitFor()
    await top.click()
    await page.getByText('Top 12 is reserved for Gold and Diamond').waitFor()
    await page.getByText('#1 · Gold Work Pass').waitFor()
    assert.ok(topRequests>=1,'client must request server-enforced Top 12')
    assert.equal(await page.getByRole('article',{name:/Showroom post by/}).count(),1,
      'Top 12 must show only the eligible server item')
    assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true,
      'Top 12 must not overflow the viewport')
    // Exercise the same Work Pass drawer users open from the navbar,
    // including the real logo asset, profile identity, signed QR and the
    // downloadable story artwork on desktop and mobile sizes.
    await page.getByRole('button',{name:'Open my Work Pass and profile'}).click()
    const workPass=page.getByRole('dialog',{name:'ChombuTar Work Pass'})
    await workPass.getByRole('heading',{name:'Studio Designer'}).waitFor()
    assert.equal(await workPass.getByText('Gold Work Pass',{exact:true}).count(),1)
    assert.equal(await workPass.getByText(/76\\s*\\/100/).count(),1)
    assert.equal(await workPass.getByText('Signed Work Pass',{exact:true}).count(),1)
    const logo=workPass.locator('img[src="/logo.png"]')
    assert.equal(await logo.count(),1,'Use actual ChombuTar logo asset')
    assert.equal(await logo.evaluate(img=>img.complete&&img.naturalWidth>0),true,'Brand logo must load')
    const hero=workPass.locator('.workpass-hero')
    assert.match(await hero.evaluate(el=>getComputedStyle(el).backgroundImage),/rgb\(10, 19, 230\)/)
    await page.screenshot({path:'test-results/work-pass-card-'+width+'.png',animations:'disabled'})
    if(width===1280){
      const artDownloadPromise=page.waitForEvent('download',{timeout:30000})
      await workPass.getByRole('button',{name:'Flex My Work Pass'}).click()
      const artDownload=await artDownloadPromise
      assert.match(artDownload.suggestedFilename(),/chombutar-work-pass-studio\.png/)
      const png=await readFile(await artDownload.path())
      assert.equal(png.toString('ascii',1,4),'PNG')
      assert.equal(png.readUInt32BE(16),1080)
      assert.equal(png.readUInt32BE(20),1920)
    }
    await workPass.getByRole('button',{name:'Close Work Pass'}).click()
    if(width===1280){
      const downloadPromise=page.waitForEvent('download',{timeout:90000})
      const rendering=page.evaluate(async()=>{
        const {shareSignedWorkPassVideo}=await import('/src/lib/workPassVideoShare.js')
        return await shareSignedWorkPassVideo({
          url:location.origin+'/fixture-video.mp4',username:'studio',
        })
      })
      const [outcome,download]=await Promise.all([rendering,downloadPromise])
      assert.equal(outcome,'downloaded')
      assert.match(download.suggestedFilename(),/chombutar-work-pass\.(webm|mp4)/)
      const file='test-results/'+download.suggestedFilename()
      await download.saveAs(file)
      const streams=execFileSync('ffprobe',['-v','error','-show_entries',
        'stream=codec_type','-of','default=noprint_wrappers=1',file],{encoding:'utf8'})
      assert.match(streams,/codec_type=video/)
      assert.match(streams,/codec_type=audio/,'original soundtrack should be present')
      execFileSync('ffmpeg',['-nostdin','-loglevel','error','-y','-ss','0.8','-i',file,
        '-frames:v','1','test-results/work-pass-sticker-frame.png'])
    }
    assert.deepEqual(pageErrors,[],'no uncaught browser errors expected')
    await context.close()
  }
  console.log('Work Pass Top 12 desktop/mobile and actual signed video export passed')
}finally{
  await browser?.close()
  await vite.close()
}
