import assert from 'node:assert/strict'
import {chromium} from 'playwright'
import {createServer} from 'vite'
import {fileURLToPath} from 'node:url'
import {optOutPageToursForFixture} from './page-tour-fixture.mjs'

const root=fileURLToPath(new URL('..',import.meta.url)),port=5202
const vite=await createServer({root,server:{host:'127.0.0.1',port,strictPort:true}})
const talentId='11111111-1111-4111-8111-111111111111'
const hatId='22222222-2222-4222-8222-222222222222'
const vibeId='33333333-3333-4333-8333-333333333333'
const viewer={id:'44444444-4444-4444-8444-444444444444',fullName:'Ziva',username:'ziva_viewer',role:'client',isAdmin:false}
const profile={user:{id:talentId,username:'amaka_guest',fullName:'Amaka',role:'talent',
    headline:'Tailor',bio:'Fine hats made by hand.',skills:['Sewing']},
  orbit:{score:8.5},portfolio:[],gallery:[],hats:{talent:[],client:[]},
  reputation:null,performance:null}
const hat={id:hatId,user_id:talentId,username:'amaka_guest',owner_full_name:'Amaka',hat_title:'Fine Hat',
  hat_name:'Fine Hat',category:'Tailoring',role:'talent',price_type:'fixed',rate:25000,
  currency:'NGN',lga:'Abuja',availability:true,motto:'Fine hat making',
  orbit_score:8.5,discovery_count:12,keepup_count:9,
  media:[{url:'/logo.png',type:'image',caption:'Fine Hat'}]}
const vibe={id:vibeId,user_id:talentId,username:'amaka_guest',owner_full_name:'Amaka',
  body:'New fine hat finished today.',media:[],created_at:'2026-11-07T11:00:00Z',likes:2,comments:1}
let browser
try {
  await vite.listen()
  browser=await chromium.launch({headless:true,
    executablePath:process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH||undefined})
  for(const width of [390,1280]){
    const context=await browser.newContext({viewport:{width,height:860}})
    await optOutPageToursForFixture(context)
    const page=await context.newPage();page.setDefaultTimeout(16000)
    const errors=[],mutationActions=[]
    let signedIn=false,following=false
    page.on('pageerror',error=>errors.push(error.message))
    await page.route('**/api/**',async route=>{
      const req=route.request(),url=new URL(req.url()),action=url.searchParams.get('action')
      const send=(body,status=200)=>route.fulfill({status,contentType:'application/json',body:JSON.stringify(body)})
      if(url.pathname==='/api/auth'){
        if(action==='me')return signedIn?send({user:viewer}):send({error:'Not signed in'},401)
        if(action==='username-check')return send({status:'available'})
        if(action==='work_pass')return send({user:{username:'amaka_guest',name:'Amaka'},
          orbit:8.5,roleOrbit:{talent:{score:8.5}},tier:'Bronze',
          completedJobs:0,successfulHires:0})
        if(req.method()==='POST'){
          const body=req.postDataJSON();mutationActions.push(body.action)
          if(body.action==='register'||body.action==='login'){signedIn=true;return send({user:viewer},body.action==='register'?201:200)}
          return send({error:'Not allowed'},401)
        }
        return send({unreadCount:0})
      }
      if(url.pathname==='/api/showroom'&&action==='guest_discovery'){
        const mode=url.searchParams.get('mode')||'showroom'
        return mode==='vibes'?send({mode,posts:[vibe],nextPage:null}):send({mode,hats:[hat],nextPage:null})
      }
      if(url.pathname==='/api/users/amaka_guest')return send(profile)
      if(url.pathname==='/api/escrows'){
        if(url.searchParams.has('associates'))return send({user_id:talentId,following,associates:[],incoming:[],subscribers:following?1:0})
        if(req.method()==='POST'){
          const data=req.postDataJSON();mutationActions.push(data.action)
          if(data.action==='associate_follow'){following=true;return send({following:true})}
        }
        return send({conversations:[],items:[],pendingCount:0})
      }
      if(url.pathname==='/api/hats/'+hatId)return send({hat})
      return send({hats:[],categories:[],count:0,posts:[],items:[],score:8.5})
    })
    await page.goto('http://127.0.0.1:'+port+'/')
    await page.getByRole('heading',{name:'What is Chombotar'}).waitFor()
    await page.getByRole('button',{name:'Pause panels'}).click()
    await page.getByRole('button',{name:'Next panel'}).click()
    await page.getByText('Bento Feed — Talent cards ranked by their latest Orbit.').waitFor()
    await page.getByRole('button',{name:'Show Hits & Vibes'}).click()
    await page.getByText('Hits & Vibes — New public work from Talent you can KeepUp with.').waitFor()
    await page.getByRole('link',{name:/Enter Showroom/}).click()
    await page.getByRole('heading',{name:'Guest Showroom'}).waitFor()
    assert.equal(mutationActions.length,0,'guest landing and Showroom cannot mutate state')
    await page.getByRole('button',{name:/\+ KeepUp/}).first().click()
    const gate=page.getByRole('dialog')
    await gate.getByRole('heading',{name:'KeepUp Amaka'}).waitFor()
    assert.equal(mutationActions.length,0,'opening guest action gate never follows')
    await gate.getByRole('link',{name:'Sign Up — Free'}).click()
    await page.getByRole('heading',{name:'Create your spotlight'}).waitFor()
    await page.getByLabel('Full name').fill('Ziva')
    await page.getByLabel('Username',{exact:true}).fill('ziva_viewer')
    await page.getByText('Available',{exact:true}).waitFor()
    await page.getByLabel('Email',{exact:true}).fill('ziva@example.test')
    await page.getByLabel('Password',{exact:true}).fill('hunter2026good')
    await page.getByLabel('Confirm password').fill('hunter2026good')
    await page.getByRole('checkbox').check()
    await page.getByRole('button',{name:/Create Account/}).click()
    await page.waitForURL('**/profile/amaka_guest?welcome=1&keepup=1')
    await page.getByText('✓ Keeping Up').waitFor()
    assert.equal(following,true,'KeepUp completes once after registration')
    assert.equal(mutationActions.filter(action=>action==='associate_follow').length,1)
    assert.equal(mutationActions.filter(action=>action==='register').length,1)
    assert.deepEqual(errors,[],'no browser runtime errors')
    await context.close()
  }
  console.log('Guest journey passed on mobile/desktop: landing stage, read-only Showroom, KeepUp gate, signup and one verified follow.')
} finally {await browser?.close();await vite.close()}
