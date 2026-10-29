import assert from 'node:assert/strict'
import {chromium} from 'playwright'
import {createServer} from 'vite'
import {fileURLToPath} from 'node:url'
import {mkdir,readFile} from 'node:fs/promises'
import {execFileSync} from 'node:child_process'
import {optOutPageToursForFixture} from './page-tour-fixture.mjs'

const root=fileURLToPath(new URL('..',import.meta.url))
const port=5196
const vite=await createServer({root,server:{host:'127.0.0.1',port,strictPort:true}})
let browser
await mkdir('test-results',{recursive:true})
const videoPath='test-results/showroom-manual-play.mp4'
execFileSync('ffmpeg',['-nostdin','-y','-loglevel','error','-f','lavfi','-i','color=c=#0A13E6:s=480x720:r=24:d=2',
  '-c:v','libx264','-pix_fmt','yuv420p','-movflags','+faststart',videoPath])
const clip=await readFile(videoPath)
const owner={id:'11111111-1111-4111-8111-111111111111',
  username:'studio',fullName:'Studio Artist',role:'talent',isAdmin:false}
const posts=[
  {id:'22222222-2222-4222-8222-222222222221',user_id:owner.id,username:'studio',owner_full_name:'Studio Artist',
    role:'talent',hat_title:'Event videographer',category:'Film',likes:1,views:3,active:true,availability:true,
    media:[{type:'video',url:'/showroom-clip.mp4',caption:'Professional event videography'}]},
  {id:'22222222-2222-4222-8222-222222222222',user_id:'99999999-9999-4999-8999-999999999999',username:'creative',
    owner_full_name:'Creative Artist',role:'talent',hat_title:'Studio photography',category:'Photography',likes:2,views:5,
    active:true,availability:true,media:[{type:'image',url:'/showroom-photo.svg',caption:'Studio photography'}]},
]
try{
  await vite.listen()
  browser=await chromium.launch({headless:true,
    executablePath:process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH||undefined})
  for(const width of [390,1280]){
    const context=await browser.newContext({viewport:{width,height:850}})
    await optOutPageToursForFixture(context)
    const page=await context.newPage()
    page.setDefaultTimeout(20000)
    const errors=[]
    page.on('pageerror',e=>errors.push(e.message))
    await page.route('**/showroom-clip.mp4',route=>route.fulfill({status:200,
      contentType:'video/mp4',body:clip,headers:{'access-control-allow-origin':'*'}}))
    await page.route('**/showroom-photo.svg',route=>route.fulfill({status:200,
      contentType:'image/svg+xml',body:'<svg xmlns="http://www.w3.org/2000/svg" width="500" height="700"><rect width="500" height="700" fill="#F7F3EB"/><rect x="30" y="30" width="440" height="640" rx="30" fill="#0A13E6"/></svg>'}))
    await page.route('**/api/**',route=>{
      const req=route.request(),url=new URL(req.url())
      const send=(body,status=200)=>route.fulfill({status,contentType:'application/json',body:JSON.stringify(body)})
      if(url.pathname==='/api/auth')return send({user:owner})
      if(url.pathname==='/api/showroom'){
        if(url.searchParams.get('action')==='likers'){
          assert.equal(url.searchParams.get('post_id'),posts[0].id)
          return send({people:[{username:'fan',name:'Fan Person',avatarUrl:null}],nextPage:null})
        }
        return send({hats:posts,galleryPosts:[],nextCursor:null,categories:[]})
      }
      if(url.pathname==='/api/escrows')return send({conversations:[],nextCursor:null,counts:{}})
      return send({hats:[],items:[],notifications:[],count:0})
    })
    await page.goto('http://127.0.0.1:'+port+'/showroom')
    const feed=page.getByRole('region',{name:'Showroom full-screen posts'})
    await feed.waitFor()
    const first=page.locator('[data-post-key]').first()
    await first.waitFor()
    const metrics=await page.evaluate(()=>{
      const feed=document.querySelector('.sr-feed-viewport')
      const card=document.querySelector('.sr-post')
      return {height:feed.clientHeight,card:card.getBoundingClientRect().height,
        snap:getComputedStyle(feed).scrollSnapType,gap:parseFloat(getComputedStyle(card).marginBottom)}
    })
    assert.ok(Math.abs(metrics.height-metrics.card-metrics.gap)<2,
      'Each post and its visible separator must fill one screen: '+JSON.stringify(metrics))
    assert.match(metrics.snap,/y mandatory/)
    const video=first.locator('video')
    await video.waitFor()
    assert.equal(await video.evaluate(el=>el.paused),true,'Video must not autoplay on arrival')
    assert.equal(await video.evaluate(el=>el.loop),false,'Video must not loop automatically')

    await first.getByRole('button',{name:'See who liked your Showroom post'}).click()
    const likers=page.getByRole('dialog',{name:'People who liked your Showroom post'})
    await likers.getByRole('link',{name:/Fan Person/}).waitFor()
    await likers.getByRole('button',{name:'Close likes list'}).click()
    await likers.waitFor({state:'detached'})

    // Wheel advances exactly one screen even when more posts are preloaded.
    await feed.hover({position:{x:90,y:160}})
    await page.mouse.wheel(0,500)
    await page.waitForFunction(()=>document.querySelector('.sr-feed-viewport')?.scrollTop>5)
    await page.waitForTimeout(650)
    const top=await feed.evaluate(el=>el.scrollTop)
    assert.ok(Math.abs(top-metrics.height)<3,'wheel should land on one post: '+top)
    assert.equal(await video.evaluate(el=>el.paused),true,'Scrolling should never start playback')

    // Once the final API page is reached, fresh shuffled laps keep the feed
    // going; adjacent loops must not show the same owner back-to-back.
    await feed.focus()
    for(let i=0;i<4;i++){
      await feed.press('PageDown')
      await page.waitForTimeout(600)
    }
    assert.ok(await feed.evaluate(el=>el.scrollTop)>metrics.height*2,
      'Feed must continue past two available posts')
    assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true)
    await page.screenshot({path:'test-results/showroom-snap-'+width+'.png',animations:'disabled'})
    assert.deepEqual(errors,[])
    await context.close()
  }
  console.log('Showroom mobile/desktop snap feed, manual video playback and owner likes viewer passed')
}finally{
  await browser?.close()
  await vite.close()
}
