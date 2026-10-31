import assert from 'node:assert/strict'
import {chromium} from 'playwright'
import {preview} from 'vite'
import {fileURLToPath} from 'node:url'
import {mkdir} from 'node:fs/promises'
import {optOutPageToursForFixture} from './page-tour-fixture.mjs'
import {formatEngagementCount} from '../src/lib/engagementCount.js'

const root=fileURLToPath(new URL('..',import.meta.url)),port=5198
const postId='22222222-2222-4222-8222-222222222222'
const rootId='33333333-3333-4333-8333-333333333333'
const childId='44444444-4444-4444-8444-444444444444'
const self={id:'11111111-1111-4111-8111-111111111111',username:'studio',full_name:'Studio User',role:'dual'}
let server,browser
try{
  await mkdir('test-results',{recursive:true})
  assert.equal(formatEngagementCount(100),'100')
  assert.equal(formatEngagementCount(1000),'1k')
  assert.equal(formatEngagementCount(1250),'1.2k')
  assert.equal(formatEngagementCount(1000000),'1m')
  server=await preview({root,preview:{host:'127.0.0.1',port,strictPort:true}})
  browser=await chromium.launch({headless:true,executablePath:process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH||undefined})
  for(const width of [320,390,1280]){
    const context=await browser.newContext({viewport:{width,height:900},serviceWorkers:'block'})
    await optOutPageToursForFixture(context)
    await context.addInitScript(() => {
      Object.defineProperty(navigator,'share',{configurable:true,value:async()=>undefined})
      Object.defineProperty(navigator,'clipboard',{configurable:true,value:{
        writeText:async value=>{window.__vibeCopied=value},
      }})
    })
    const page=await context.newPage()
    page.setDefaultTimeout(15000)
    const errors=[]
    page.on('pageerror',error=>errors.push(error.message))
    const post={id:postId,author_id:'77777777-7777-4777-8777-777777777777',username:'creator',
      full_name:'Creator Person',body:'Building community conversations',media:[],likes:1,replies:2,shares:0,
      liked_by_me:false,created_at:'2026-10-30T12:00:00Z'}
    let roots=[{id:rootId,post_id:postId,parent_id:null,author_id:'88888888-8888-4888-8888-888888888888',
      username:'friend',full_name:'Friend Person',body:'Original comment',child_count:1,
      created_at:'2026-10-30T12:01:00Z',deleted:false}]
    let children=[{id:childId,post_id:postId,parent_id:rootId,author_id:'99999999-9999-4999-8999-999999999999',
      username:'member',full_name:'Other Member',body:'Older nested reply',child_count:0,
      created_at:'2026-10-30T12:02:00Z'}]
    await page.route('**/api/**',route=>{
      const url=new URL(route.request().url())
      const data=route.request().method()==='POST'?route.request().postDataJSON():{}
      const respond=(payload,status=200)=>route.fulfill({status,contentType:'application/json',body:JSON.stringify(payload)})
      if(url.pathname==='/api/auth')return respond({user:self,unreadCount:0})
      if(url.pathname==='/api/escrows')return respond({conversations:[],threads:[],counts:{}})
      if(url.pathname==='/api/vibes'){
        if(url.searchParams.has('likers'))return respond({people:[{
          username:'friend',name:'Friend Person',avatarUrl:null,likedAt:'2026-10-30T12:03:00Z',
        }],nextPage:null})
        if(url.searchParams.has('comments'))return respond({
          comments:url.searchParams.get('parent_id')===rootId?children:roots,threaded:true,nextCursor:null,
        })
        if(route.request().method()==='GET')return respond({posts:[post],nextCursor:null})
        if(data.action==='share'){post.shares=1;return respond({shares:1})}
        if(data.action==='like'){post.likes=post.likes===1?2:1;post.liked_by_me=!post.liked_by_me
          return respond({likes:post.likes,liked:post.liked_by_me})}
        if(data.action==='reply'){
          const created={id:'55555555-5555-4555-8555-555555555555',
            post_id:postId,parent_id:data.parent_id||null,author_id:self.id,
            username:self.username,full_name:self.full_name,body:data.text,
            created_at:'2026-10-30T12:05:00Z',child_count:0,deleted:false}
          if(data.parent_id){children=[...children,created];roots[0].child_count++;post.replies++}
          else{roots=[...roots,created];post.replies++}
          return respond({id:created.id,parent_id:data.parent_id||null})
        }
        return respond({ok:true})
      }
      return respond({hats:[],items:[],notifications:[],count:0})
    })
    await page.goto('http://127.0.0.1:'+port+'/vibes')
    const article=page.getByRole('article',{name:'Vibe by Creator Person'})
    try{await article.waitFor()}catch(err){
      console.error('Vibes fixture diagnostic',JSON.stringify({
        url:page.url(),
        text:(await page.locator('body').innerText()).slice(0,3000),
        errors,
      }))
      await page.screenshot({path:'test-results/vibes-thread-'+width+'.png',fullPage:true})
      throw err
    }
    // Size feedback is measured in MB, not in attachment slots.
    assert.equal(await page.getByText('(0/10)').count(),0)
    assert.equal(await page.getByText('80 MB max').count(),1)
    const png=Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVQIHWP4z8DwHwAFgAI/ScL/nwAAAABJRU5ErkJggg==','base64')
    const upload=Buffer.concat([png,Buffer.alloc(1024*1024-png.length)])
    await page.getByLabel('Choose Vibes photos').setInputFiles({
      name:'tiny-photo.png',mimeType:'image/png',buffer:upload,
    })
    await page.getByLabel('Media storage: 1 of 80 MB').waitFor()
    await page.getByRole('button',{name:'Remove photo'}).click()
    await page.getByText('80 MB max').waitFor()
    const summary=article.getByRole('region',{name:'Vibe engagement counts'})
    // The like count, comments, shares and lower actions have distinct roles.
    const counts=article.locator('[aria-label="Vibe engagement counts"]')
    await counts.getByRole('button',{name:/View people who liked this Vibe/}).waitFor()
    await counts.getByRole('button',{name:'View comments (2)'}).waitFor()
    assert.equal(await counts.getByLabel('0 shares').count(),1)
    assert.equal(await article.getByRole('button',{name:'See who liked this Vibe'}).count(),0)
    const actions=article.locator('[aria-label="Vibe actions"]')
    assert.equal(await actions.getByRole('button').count(),3)
    await counts.getByRole('button',{name:/View people who liked this Vibe/}).click()
    const dialog=page.getByRole('dialog',{name:'People who liked this Vibe'})
    await dialog.getByRole('link',{name:/Friend Person/}).waitFor()
    assert.equal(await dialog.locator('a[href="/profile/friend"]').count(),1)
    await dialog.getByRole('button',{name:'Close Vibes likes'}).click()
    await dialog.waitFor({state:'detached'})
    await actions.getByRole('button',{name:'Share Vibe'}).click()
    const share=page.getByRole('dialog',{name:'Share this Vibe'})
    await share.waitFor()
    for(const app of ['WhatsApp','Facebook','X (Twitter)','Telegram','LinkedIn','Email']){
      const link=share.getByRole('link',{name:'Share on '+app})
      await link.waitFor()
      assert.ok((await link.getAttribute('href')).length>15,'Missing destination URL for '+app)
    }
    const permalink=await share.getByRole('textbox',{name:'Link to this Vibe'}).inputValue()
    assert.ok(permalink.endsWith('/vibes?post='+postId))
    await share.getByRole('button',{name:'Copy Vibe link'}).click()
    await share.getByText('Link copied. You can paste it anywhere.').waitFor()
    assert.equal(await page.evaluate(()=>window.__vibeCopied),permalink)
    await share.getByRole('button',{name:/More apps · Device share/}).click()
    await share.waitFor({state:'detached'})
    await article.locator('[aria-label="Vibe engagement counts"]').getByLabel('1 shares').waitFor()
    await actions.getByRole('button',{name:'Comment on Vibe'}).click()
    await page.waitForURL(url=>url.pathname==='/vibes/'+postId+'/comments')
    const conversation=page.getByRole('main',{name:'Vibe conversation page'})
    await conversation.getByRole('heading',{name:'Comments'}).waitFor()
    assert.equal(await conversation.getByRole('article',{name:'Vibe by Creator Person'}).count(),1,
      'full-page conversation keeps the original post visible')
    const thread=conversation.locator('[data-thread-id="'+rootId+'"]')
    await thread.getByText('Original comment').waitFor()
    assert.equal(await thread.getByText('Older nested reply').count(),0,'Nested replies should be expandable')
    await thread.getByRole('button',{name:/View 1 reply/}).click()
    await thread.getByText('Older nested reply').waitFor()
    await thread.getByRole('button',{name:'Reply',exact:true}).first().click()
    const composer=thread.getByRole('textbox',{name:'Reply to Friend Person'})
    await composer.fill('A thoughtful second-level response')
    await thread.getByRole('button',{name:'Send threaded reply'}).click()
    await thread.getByText('A thoughtful second-level response').waitFor()
    await conversation.getByRole('button',{name:'View comments (3)'}).waitFor()
    assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true,
      'Vibes comments should fit at '+width+'px')
    await page.screenshot({path:'test-results/vibes-thread-'+width+'.png',animations:'disabled'})
    assert.deepEqual(errors,[],'No uncaught browser errors on '+width+'px')
    await context.close()
  }
  // Shared post links must survive the login boundary (including a fresh
  // account without a session). The auth redirect may only target this Vibe.
  const guest=await browser.newContext({viewport:{width:390,height:850},serviceWorkers:'block'})
  await optOutPageToursForFixture(guest)
  const guestPage=await guest.newPage()
  guestPage.setDefaultTimeout(15000)
  let signedIn=false
  await guestPage.route('**/api/**',route=>{
    const url=new URL(route.request().url())
    const respond=(data)=>route.fulfill({status:200,contentType:'application/json',body:JSON.stringify(data)})
    if(url.pathname==='/api/auth'){
      if(route.request().method()==='POST'){
        const data=route.request().postDataJSON()
        if(data?.action==='login'){signedIn=true;return respond({user:self})}
      }
      return respond({user:signedIn?self:null})
    }
    if(url.pathname==='/api/vibes')return respond({posts:[{
      id:postId,author_id:self.id,username:'creator',full_name:'Creator Person',
      body:'Shared post destination',media:[],likes:0,replies:0,shares:0,
      created_at:'2026-10-30T12:00:00Z',
    }],nextCursor:null})
    return respond({hats:[],items:[],notifications:[],count:0,threads:[]})
  })
  await guestPage.goto('http://127.0.0.1:'+port+'/vibes?post='+postId)
  await guestPage.waitForURL(url=>url.pathname==='/auth')
  const next=new URL(guestPage.url()).searchParams.get('next')
  assert.equal(next,'/vibes?post='+postId)
  await guestPage.getByLabel('Email',{exact:true}).fill('studio@example.test')
  await guestPage.getByLabel('Password',{exact:true}).fill('password123')
  await guestPage.getByRole('button',{name:'Login — Own Your Spotlight'}).click()
  await guestPage.waitForURL(url=>url.pathname==='/vibes'&&url.searchParams.get('post')===postId)
  await guestPage.getByRole('article',{name:'Vibe by Creator Person'}).waitFor()
  await guest.close()

  console.log('Vibes hierarchy, inline reply, liker identities and responsive layout passed.')
}finally{
  await browser?.close()
  if(server)await new Promise(resolve=>server.httpServer.close(resolve))
}
