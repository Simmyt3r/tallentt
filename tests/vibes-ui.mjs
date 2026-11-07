import { chromium } from 'playwright'
import { preview } from 'vite'
import { fileURLToPath } from 'node:url'
import assert from 'node:assert/strict'
import {optOutPageToursForFixture} from './page-tour-fixture.mjs'

const vite=await preview({
  root:fileURLToPath(new URL('..',import.meta.url)),
  preview:{host:'127.0.0.1',port:5187,strictPort:true},
})
let browser
try {
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
    const keptPost={id:'44444444-4444-4444-8444-444444444444',
      author_id:'55555555-5555-4555-8555-555555555555',
      username:'kept_talent',full_name:'Kept Up Talent',created_at:'2026-10-14T12:02:00Z',
      body:'Kept-up Talent update',media:[]}
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
        if(route.request().method()==='GET'){
          const mode=url.searchParams.get('feed')==='keeping_up'?'keeping_up':'for_you'
          const search=(url.searchParams.get('search')||'').toLowerCase()
          const source=mode==='keeping_up'?[keptPost]:posts
          return send({posts:source.filter(p=>(p.body||'').toLowerCase().includes(search))
            .map(p=>({...p,likes:mode==='for_you'?likes:0,liked_by_me:mode==='for_you'?liked:false,
              replies:mode==='for_you'?comments.length:0})),nextCursor:null,feed:mode})
        }
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
    assert.doesNotMatch(await page.locator('main').last().innerText(),/(^|\n)\s*}\s*($|\n)/,'No stray JSX brace in an empty feed')
    assert.equal(await page.getByRole('textbox',{name:'Search Vibes posts and people'}).count(),1)
    const filters=page.getByRole('navigation',{name:'Vibes feed filters'})
    const forYou=filters.getByRole('button',{name:'For You'})
    const keepingUp=filters.getByRole('button',{name:'Keeping Up'})
    assert.equal(await forYou.getAttribute('aria-pressed'),'true')
    assert.equal(await keepingUp.getAttribute('aria-pressed'),'false')
    assert.equal(await filters.evaluate(node=>getComputedStyle(node).borderBottomWidth),'0px')
    const vibeComposer=page.getByRole('textbox',{name:'Say something…'})
    const centeredHint=page.locator('form[aria-label="Create a Vibe"] span[aria-hidden="true"]')
      .filter({hasText:'Say something…'})
    await centeredHint.waitFor()
    const [composerBox,hintBox]=await Promise.all([vibeComposer.boundingBox(),centeredHint.boundingBox()])
    assert.ok(Math.abs((composerBox.y+composerBox.height/2)-(hintBox.y+hintBox.height/2))<2,
      'Empty Vibes placeholder should be vertically centered at '+width+'px')
    await vibeComposer.fill('First Vibe!')
    assert.equal(await centeredHint.count(),0,'Centered hint must disappear as soon as writing begins')
    await page.getByRole('button',{name:'Post Vibe'}).click()
    await page.getByText('First Vibe!').waitFor()
    assert.doesNotMatch(await page.locator('main').last().innerText(),/(^|\n)\s*}\s*($|\n)/,'No stray JSX brace after feed posts')
    assert.equal(published,true)
    await keepingUp.click()
    await page.getByText('Kept-up Talent update').waitFor()
    assert.equal(new URL(page.url()).searchParams.get('feed'),'keeping_up')
    assert.equal(await page.getByText('First Vibe!').count(),0)
    assert.equal(await keepingUp.getAttribute('aria-pressed'),'true')
    await page.getByRole('textbox',{name:'Search Vibes posts and people'}).fill('nothing here')
    await page.getByText('No updates from people you KeepUp with yet').waitFor()
    await page.getByRole('button',{name:'Explore For You'}).click()
    await page.getByRole('textbox',{name:'Search Vibes posts and people'}).fill('')
    await page.getByText('First Vibe!').waitFor()
    assert.equal(new URL(page.url()).searchParams.has('feed'),false)
    assert.equal(await forYou.getAttribute('aria-pressed'),'true')
    await page.getByRole('button',{name:'Like Vibe'}).click()
    await page.getByRole('button',{name:'Unlike Vibe'}).waitFor()
    // The reply composer is not embedded in the feed; comments have a
    // dedicated route, and the same post remains visible above the discussion.
    await page.getByRole('button',{name:'Comment on Vibe'}).click()
    await page.waitForURL(url=>url.pathname==='/vibes/'+postId+'/comments')
    await page.getByRole('heading',{name:'Comments'}).waitFor()
    await page.getByRole('textbox',{name:'Write a reply'}).fill('Hello!')
    await page.getByRole('button',{name:'Send reply'}).click()
    await page.getByText('Hello!').waitFor()
    const replies=page.locator('[aria-label="Comments list"]')
    await replies.getByText('Hello!',{exact:true}).waitFor()
    assert.equal(await replies.evaluate(node=>node.nextElementSibling?.tagName),'FORM',
      'Reply composer must follow the scrollable comments list')
    assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true,
      'Vibes must not horizontally overflow on '+width+'px')
    assert.deepEqual(errors,[])
    await context.close()
  }
  console.log('Vibes smoke tests passed at 320px, 390px and 1280px.')
} finally {
  await browser?.close()
  await new Promise(resolve=>vite.httpServer.close(resolve))
}
