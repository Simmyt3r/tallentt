import { chromium } from 'playwright'
import { createServer } from 'vite'
import { fileURLToPath } from 'node:url'
import { mkdir } from 'node:fs/promises'
import assert from 'node:assert/strict'

const vite=await createServer({
  root:fileURLToPath(new URL('..',import.meta.url)),
  server:{host:'127.0.0.1',port:5185,strictPort:true},
})
let browser
try{
  await vite.listen()
  browser=await chromium.launch({
    headless:true,
    executablePath:process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH||undefined,
  })
  await mkdir('test-results',{recursive:true})
  const user={id:'f7b95df5-824d-47fd-af0f-19e466481132',
    username:'studio',fullName:'Studio',role:'talent',isAdmin:true}
  const hat={id:'9ef7baef-8a52-4fef-8ec1-d48c01379c14',
    user_id:user.id,username:user.username,hat_title:'Product photographer',
    hat_name:'Portrait sessions',role:'talent',category:'Film',media:[]}
  const audioReview={media_id:'d5ac5261-856a-44a4-a38b-dfa9ec28fcb3',
    hat_id:hat.id,hat_title:hat.hat_title,owner_username:user.username,
    url:'https://res.cloudinary.com/demo/video/upload/v123/sample.mp3',
    type:'audio',screening_status:'held',
    screening_reason:'audio_requires_manual_review'}
  for(const width of [390,1280]){
    const context=await browser.newContext({viewport:{width,height:880}})
    const page=await context.newPage()
    page.setDefaultTimeout(15000)
    const errors=[]
    page.on('pageerror',(error)=>errors.push(error.message))
    let published=0
    await page.route('**/api/**',async(route)=>{
      const req=route.request(),url=new URL(req.url()),action=url.searchParams.get('action')
      const send=(body,status=200)=>route.fulfill({
        status,contentType:'application/json',body:JSON.stringify(body),
      })
      if(url.pathname==='/api/auth')return send({user})
      if(url.pathname==='/api/escrows' && url.searchParams.has('conversations')) {
        return send({conversations:[],nextCursor:null})
      }
      if(url.pathname==='/api/admin'){
        if(action==='showroom_screening_config')return send({
          cloudName:'demo',cloudConfigured:true,visionConfigured:true,
          workerConfigured:true,enabled:false,ready:true,
          signedUploadStatus:{enabled:false,credentialsConfigured:true,migrationInstalled:true},
        })
        if(action==='showroom_preflight')return send({
          migrations:[],readyToDeploy:true,encryptionRootConfigured:true,
          signedUploads:{enabled:false,credentialsConfigured:true,cloudName:'demo'},
        })
        if(action==='showroom_screening_ops')return send({counts:{},due:0,runs:[]})
        if(action==='showroom_reports')return send({items:[],flagged:0})
        if(action==='showroom_media')return send({
          items:[audioReview],counts:{pending:0,processing:0,held:1,rejected:0},
          screeningEnabled:false,providerConfigured:true,workerConfigured:true,
        })
        if(action==='showroom_appeals')return send({items:[]})
        if(req.method()==='POST'){
          const body=req.postDataJSON()
          if(body.action==='test_showroom_cloudinary')return send({
            ok:true,validatedAt:'2026-10-11T15:30:00.000Z',
          })
          return send({ok:true})
        }
        return send({admin:{username:'studio'},metrics:{},lists:{}})
      }
      if(url.pathname==='/api/hats'){
        if(req.method()==='POST'){
          const body=req.postDataJSON()
          if(body.action==='upload_sign')return send({enabled:false})
          return send({hat})
        }
        return send({hats:[hat]})
      }
      if(url.pathname===`/api/hats/${hat.id}` && req.method()==='PUT'){
        published++
        return send({hat:{...hat,media:req.postDataJSON().media}})
      }
      if(url.pathname==='/api/showroom')return send({
        hats:[],nextCursor:null,categories:[],
      })
      if(url.searchParams.get('categories'))return send({categories:[]})
      return send({hats:[],items:[],categories:[],notifications:[],count:0})
    })
    await page.route('https://api.cloudinary.com/**',route=>route.fulfill({
      status:200,contentType:'application/json',headers:{'access-control-allow-origin':'*'},
      body:JSON.stringify({
        resource_type:'video',secure_url:
          'https://res.cloudinary.com/demo/video/upload/v123/portraits/clip.mp4',
        public_id:'portraits/clip',
      }),
    }))

    // Home always opens Showroom, even for a previously saved Bento landing.
    await page.addInitScript((id) => localStorage.setItem(`chombutar:lastLanding:${id}`, 'bento'), user.id)
    await page.goto('http://127.0.0.1:5185/')
    await page.waitForURL('**/showroom')
    await page.getByRole('link', { name: 'Showroom', exact: true }).first().waitFor()
    assert.equal(await page.getByRole('heading', { name: 'Showroom' }).count() >= 1, true)
    assert.equal(await page.getByText(/Ready to hire\?/).count(), 0)
    assert.equal(await page.getByRole('button', { name: 'Talent', exact: true }).count(), 0)
    assert.equal(await page.getByRole('button', { name: 'Client', exact: true }).count(), 0)
    const quickActions = page.getByRole('navigation', { name: 'Quick actions' })
    const createAction = quickActions.getByRole('link', { name: 'Create Hat' })
    const messagesAction = quickActions.getByRole('link', { name: 'Messages' })
    const alertsAction = quickActions.getByRole('link', { name: /^Notifications/ })
    const showroomSearch = page.getByRole('searchbox', { name: 'Search Showroom posts and creators' })
    await showroomSearch.waitFor()
    assert.equal(await quickActions.getByRole('link', { name: 'Search' }).count(), 0,
      'Showroom must expose exactly one search action')
    assert.equal(await createAction.isVisible(), width >= 640)
    assert.equal(await messagesAction.isVisible(), true)
    assert.equal(await alertsAction.isVisible(), true)
    assert.equal(await page.getByRole('link', { name: 'Profile' }).isVisible(), true)
    if (width < 768) {
      assert.equal(await page.getByRole('navigation', { name: 'Primary' })
        .getByRole('link', { name: 'My Hats' }).isVisible(), true)
      await page.setViewportSize({ width: 320, height: 880 })
      assert.equal(await createAction.isVisible(), false)
      assert.equal(await showroomSearch.isVisible(), true)
      assert.equal(await messagesAction.isVisible(), true)
      assert.equal(await alertsAction.isVisible(), true)
      assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true)
      await page.setViewportSize({ width, height: 880 })
    }
    // One always-visible pill search, shared with BentoField.
    await showroomSearch.focus()
    await page.waitForFunction(() => document.activeElement?.id === 'showroom-search')
    await showroomSearch.fill('studio')
    await showroomSearch.press('Escape')
    assert.equal(await showroomSearch.inputValue(), '')
    assert.equal(await page.getByRole('button',{name:'Search Showroom'}).count(),0)

    // Every major tab exposes the same compact pill search, with one
    // search box and no duplicate icon/button per tab.
    for(const [path,label] of [
      ['/vibes','Search Vibes posts and people'],
      ['/my-hats','Search your Hats'],
      ['/deals','Search loaded deal records'],
    ]){
      await page.goto('http://127.0.0.1:5185'+path)
      await page.getByRole('searchbox',{name:label}).waitFor()
      assert.equal(await page.getByRole('searchbox').count(),1)
    }
    await page.goto('http://127.0.0.1:5185/showroom')

    await quickActions.getByRole('link', { name: 'Messages' }).click()
    await page.waitForURL('**/messages')
    // Every route has its own protected Layout. Re-enter a settled Home
    // before validating the next action, instead of racing a route remount.
    await page.goto('http://127.0.0.1:5185/showroom')
    await showroomSearch.waitFor()
    await quickActions.getByRole('link', { name: /^Notifications/ }).click()
    await page.waitForURL('**/notifications')
    await page.goto('http://127.0.0.1:5185/showroom')
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true)
    await page.screenshot({ path: `test-results/showroom-header-actions-${width}.png`, fullPage: true })

    await page.goto('http://127.0.0.1:5185/admin?tab=showroom-config')
    await page.getByRole('heading',{name:'Showroom safety setup'}).waitFor()
    if(width<1024){
      assert.equal(await page.locator('#admin-section-picker').isVisible(),true,
        'mobile Admin should have a visible navigation picker')
      assert.equal(await page.getByRole('navigation',{name:'Admin sections'}).isVisible(),false)
    }else{
      assert.equal(await page.locator('#admin-section-picker').isVisible(),false)
      assert.equal(await page.getByRole('navigation',{name:'Admin sections'}).isVisible(),true)
    }
    assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true,
      'Admin configuration must not cause horizontal overflow')
    await page.screenshot({
      path:`test-results/showroom-admin-settings-${width}.png`,fullPage:true,
    })
    // Mobile section picker is functional, not merely decoration.
    if(width<1024)await page.locator('#admin-section-picker').selectOption('showroom')
    else await page.getByRole('navigation',{name:'Admin sections'})
      .getByRole('button',{name:'Showroom Reports'}).click()
    await page.getByRole('heading',{name:'Media awaiting review'}).waitFor()
    await page.locator('audio[controls]').waitFor({state:'visible'})
    assert.equal(await page.locator('audio[controls]').count(),1,
      'audio review must provide a playable recording')
    assert.equal(await page.getByText('All caught up').count(),0,
      'review queue must not claim empty with an audio item')
    assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true)
    await page.screenshot({
      path:`test-results/showroom-moderation-${width}.png`,fullPage:true,
    })

    await page.goto('http://127.0.0.1:5185/showroom')
    const open=page.getByRole('button',{name:'Add to Showroom'})
    await open.waitFor()
    await open.click()
    await page.getByRole('heading',{name:'Choose how to post'}).waitFor()
    await page.keyboard.press('Escape')
    await page.getByRole('heading',{name:'Pick a card'}).waitFor({state:'detached'})
    assert.equal(await open.evaluate(el=>document.activeElement===el),true,
      'closing the dialog must restore keyboard focus')
    for(let round=1;round<=2;round++){
      await open.click()
      await page.getByRole('heading',{name:'Pick a card'}).waitFor()
      await page.getByRole('button',{name:/Choose an existing Hat/}).click()
      await page.getByRole('button',{name:/Product photographer/}).click()
      await page.getByRole('heading',{name:'Add media'}).waitFor()
      await page.locator('.modal-panel input[type=file]').setInputFiles({
        name:'clip.mp4',mimeType:'video/mp4',buffer:Buffer.from([0,0,0,24,102,116,121,112,109,112,52,50]),
      })
      await page.getByRole('heading',{name:'Add a caption'}).waitFor()
      const post=page.getByRole('button',{name:'Post to Showroom'})
      assert.equal(await post.isEnabled(),true,
        'submit must re-enable when modal is reopened')
      await post.click()
      await page.getByRole('heading',{name:'Pick a card'}).waitFor({
        state:'detached',
      })
    }
    assert.equal(published,2,'posting twice should work after reset')
    assert.deepEqual(errors,[],'no runtime errors expected')
    await context.close()
  }
  console.log('Showroom Admin navigation, audio moderation and posting UX pass desktop/mobile')
} finally {
  await browser?.close()
  await vite.close()
}
