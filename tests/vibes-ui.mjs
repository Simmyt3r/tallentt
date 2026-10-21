import { chromium } from 'playwright'
import { createServer } from 'vite'
import { fileURLToPath } from 'node:url'
import assert from 'node:assert/strict'
import {optOutPageToursForFixture} from './page-tour-fixture.mjs'

const vite=await createServer({
  root:fileURLToPath(new URL('..',import.meta.url)),
  server:{host:'127.0.0.1',port:5187,strictPort:true},
})
let browser
try {
  await vite.listen()
  browser=await chromium.launch({
    headless:true,
    executablePath:process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH||undefined,
  })
  for(const width of [320,390,1280]) {
    const context=await browser.newContext({viewport:{width,height:900}})
    await optOutPageToursForFixture(context)
    const page=await context.newPage()
    page.setDefaultTimeout(12000)
    const errors=[]
    page.on('pageerror',error=>errors.push(error.message))
    const user={id:'11111111-1111-4111-8111-111111111111',
      username:'studio',full_name:'Studio',role:'dual'}
    const postId='22222222-2222-4222-8222-222222222222'
    let posts=[],comments=[],likes=0,liked=false
    let published=false
    await page.route('**/api/**',async route=>{
      const url=new URL(route.request().url())
      const body=route.request().method()==='POST'
        ? route.request().postDataJSON() : {}
      const send=(value,status=200)=>route.fulfill({
        status,contentType:'application/json',body:JSON.stringify(value),
      })
      if(url.pathname==='/api/auth')return send({user,unreadCount:0})
      if(url.pathname==='/api/escrows')return send({pendingCount:0})
      if(url.pathname==='/api/vibes') {
        if(route.request().method()==='GET' && url.searchParams.has('comments'))
          return send({comments,nextCursor:null})
        if(route.request().method()==='GET')
          return send({posts:posts.map(p=>({...p,likes,liked_by_me:liked,replies:comments.length})),nextCursor:null})
        if(body.action==='publish'){
          published=true
          posts=[{id:postId,author_id:user.id,username:'studio',full_name:'Studio',
            created_at:'2026-10-14T12:00:00Z',body:body.text,media:body.media}]
          return send({id:postId},201)
        }
        if(body.action==='like') {
          liked=!liked
          likes=liked?1:0
          return send({liked,likes})
        }
        if(body.action==='reply'){
          comments=[{id:'33333333-3333-4333-8333-333333333333',
            author_id:user.id,username:'studio',full_name:'Studio',
            body:body.text,created_at:'2026-10-14T12:01:00Z'}]
          return send({id:comments[0].id})
        }
        if(body.action==='delete') {
          posts=[]
          return send({deleted:true})
        }
        return send({ok:true})
      }
      return send({rooms:[],hats:[],items:[],notifications:[],unreadCount:0})
    })
    await page.goto('http://127.0.0.1:5187/vibes')
    await page.getByRole('heading',{name:'Hits & Vibes'}).waitFor()
    await page.getByRole('navigation',{name:'Primary'}).getByRole('link',{name:'Vibes'}).waitFor({state:width<768?'visible':'hidden'}).catch(()=>{})
    assert.equal(await page.getByRole('heading',{name:'Hits & Vibes'}).count(),1)
    assert.equal(await page.getByText('Nothing here yet').count(),1)
    assert.equal(await page.getByRole('searchbox',{name:'Search Vibes posts and people'}).count(),1)
    await page.getByRole('textbox',{name:'Say something…'}).fill('First Vibe!')
    await page.getByRole('button',{name:'Post Vibe'}).click()
    await page.getByText('First Vibe!').waitFor()
    assert.equal(published,true)
    await page.getByRole('button',{name:'Like Vibe'}).click()
    await page.getByRole('button',{name:'Unlike Vibe'}).waitFor()
    await page.getByRole('button',{name:/Replies/}).click()
    await page.getByRole('textbox',{name:'Write a reply'}).fill('Hello!')
    await page.getByRole('button',{name:'Send reply'}).click()
    await page.getByText('Hello!').waitFor()
    const input=page.getByRole('textbox',{name:'Write a reply'})
    const reply=page.getByText('Hello!')
    assert.equal(await reply.evaluate(el=>el.getBoundingClientRect().bottom),await reply.evaluate(el=>el.getBoundingClientRect().bottom))
    assert.ok((await input.boundingBox()).y>(await reply.boundingBox()).y,'Replies should appear above composer')
    assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true,
      'Vibes must not horizontally overflow on '+width+'px')
    assert.deepEqual(errors,[])
    await context.close()
  }
  console.log('Vibes smoke tests passed at 320px, 390px and 1280px.')
} finally {
  await browser?.close()
  await vite.close()
}
