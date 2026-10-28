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
    // Self-contained visual media fixtures; no reliance on third-party hosts.
    const portrait='<svg xmlns="http://www.w3.org/2000/svg" width="500" height="500" viewBox="0 0 500 500"><defs><linearGradient id="bg" x2="1" y2="1"><stop stop-color="#BBC8FF"/><stop offset="1" stop-color="#182B87"/></linearGradient></defs><rect width="500" height="500" fill="url(#bg)"/><path d="M70 500Q92 315 250 305Q408 315 430 500" fill="#1E264D"/><circle cx="250" cy="207" r="119" fill="#9C6549"/><path d="M129 201Q123 54 250 61Q384 69 371 205Q351 133 250 133Q153 134 129 201" fill="#151B32"/><path d="M210 231h24m41 0h24" stroke="#302421" stroke-width="7" stroke-linecap="round"/><path d="M226 274Q251 293 277 274" fill="none" stroke="#693C33" stroke-width="6" stroke-linecap="round"/></svg>'
    await page.route('**/fixture-portrait.svg',route=>route.fulfill({
      status:200,contentType:'image/svg+xml',body:portrait,
    }))
    await page.route('**/fixture-evidence.svg',route=>route.fulfill({
      status:200,contentType:'image/svg+xml',body:'<svg xmlns="http://www.w3.org/2000/svg" width="400" height="320"><rect width="400" height="320" rx="16" fill="#0A13E6"/><rect x="50" y="56" width="300" height="208" rx="18" fill="#F7F3EB"/><rect x="73" y="84" width="255" height="22" rx="5" fill="#ADB4F3"/><rect x="73" y="126" width="110" height="90" rx="10" fill="#0A13E6"/><rect x="198" y="130" width="110" height="10" rx="4" fill="#ADB4F3"/><rect x="198" y="153" width="110" height="10" rx="4" fill="#ADB4F3"/></svg>',
    }))
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
          user:{username:'studio',name:'Studio Designer',role:'talent',headline:'Visual storyteller',avatarUrl:'/fixture-portrait.svg',skills:['Photography','Editing']},
          completedJobs:12,successfulHires:3,orbit:76,evidence:[{id:'evidence-1',image_url:'/fixture-evidence.svg'}],endorsements:[],robots:[]})
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
    assert.equal(await workPass.getByText(/76\s*\/100/).count(),1)
    assert.equal(await workPass.getByText('Signed Work Pass',{exact:true}).count(),1)
    const logo=workPass.locator('img[src="/logo.png"]')
    assert.equal(await logo.count(),1,'Use actual ChombuTar logo asset')
    await logo.evaluate(img=>img.decode())
    assert.equal(await logo.evaluate(img=>img.complete&&img.naturalWidth>0),true,'Brand logo must load')
    const portraitImage=workPass.getByRole('img',{name:'Studio Designer profile photograph'})
    await portraitImage.evaluate(img=>img.decode())
    assert.ok(await portraitImage.evaluate(img=>img.naturalWidth>0),'User profile image must render')
    assert.equal(await workPass.getByRole('img',{name:'Customer-approved work 1'}).count(),1)
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
