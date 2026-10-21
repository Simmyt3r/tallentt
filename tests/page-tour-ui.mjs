import {chromium} from 'playwright'
import {createServer} from 'vite'
import {fileURLToPath} from 'node:url'
import assert from 'node:assert/strict'

const vite=await createServer({
  root:fileURLToPath(new URL('..',import.meta.url)),
  server:{host:'127.0.0.1',port:5188,strictPort:true},
})
let browser
try{
  await vite.listen()
  browser=await chromium.launch({
    headless:true,
    executablePath:process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH||undefined,
  })
  for(const width of [390,1280]){
    const context=await browser.newContext({viewport:{width,height:880}})
    const page=await context.newPage()
    page.setDefaultTimeout(15000)
    let currentUser={id:'11111111-1111-4111-8111-111111111111',
      username:'alice',fullName:'Alice',role:'dual',isAdmin:false}
    const errors=[]
    page.on('pageerror',e=>errors.push(e.message))
    await page.route('**/api/**',async route=>{
      const url=new URL(route.request().url())
      const send=(body)=>route.fulfill({status:200,contentType:'application/json',body:JSON.stringify(body)})
      if(url.pathname==='/api/auth')return send({user:currentUser,unreadCount:0,notifications:[]})
      if(url.pathname==='/api/escrows')return send({pendingCount:0,items:[],counts:{},nextCursor:null})
      if(url.pathname==='/api/showroom')return send({posts:[],hats:[],categories:[],nextCursor:null})
      if(url.pathname==='/api/hats')return send({hats:[],categories:[],nextCursor:null})
      if(url.pathname==='/api/vibes')return send({posts:[],nextCursor:null})
      if(url.pathname==='/api/live')return send({rooms:[],broadcast_ready:false,reason:'unconfigured'})
      return send({items:[],posts:[],rooms:[],hats:[],users:[],notifications:[],nextCursor:null})
    })

    // Each page introduces itself once; a normal dismissal does not opt out globally.
    await page.goto('http://127.0.0.1:5188/showroom')
    const guide=()=>page.getByRole('dialog',{name:/Welcome to Showroom|This is Bento Field|Welcome to Hits & Vibes/})
    await page.getByRole('dialog',{name:'Welcome to Showroom'}).waitFor()
    assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true)
    await page.getByRole('button',{name:'Got it',exact:true}).click()
    assert.equal(await guide().count(),0)
    await page.reload()
    assert.equal(await guide().count(),0,'Got it is sticky on reload')

    await page.goto('http://127.0.0.1:5188/bento')
    await page.getByRole('dialog',{name:'This is Bento Field'}).waitFor()
    await page.getByRole('button',{name:"Don't show me again"}).click()
    await page.goto('http://127.0.0.1:5188/vibes')
    await page.getByRole('heading',{name:'Hits & Vibes'}).waitFor()
    assert.equal(await page.getByRole('dialog',{name:'Welcome to Hits & Vibes'}).count(),0)
    await page.reload()
    assert.equal(await page.getByRole('dialog').count(),0,'Global opt-out persists across reloads')

    // Same device can host another account without inheriting first account's opt-out.
    currentUser={...currentUser,id:'22222222-2222-4222-8222-222222222222',username:'bob'}
    await page.goto('http://127.0.0.1:5188/showroom')
    await page.getByRole('dialog',{name:'Welcome to Showroom'}).waitFor()
    await page.getByRole('button',{name:"Don't show me again"}).click()

    await page.goto('http://127.0.0.1:5188/settings')
    await page.getByRole('button',{name:'Restart page tour'}).click()
    await page.getByRole('dialog',{name:'Welcome to Showroom'}).waitFor()
    assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true)
    assert.deepEqual(errors,[])
    await context.close()
  }
  console.log('Page tour browser tests passed for mobile and desktop, opt-out, account isolation and restart.')
}finally{
  await browser?.close()
  await vite.close()
}
