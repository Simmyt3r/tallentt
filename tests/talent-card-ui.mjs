import assert from 'node:assert/strict'
import {mkdir} from 'node:fs/promises'
import {chromium} from 'playwright'
import {preview} from 'vite'
import {optOutPageToursForFixture} from './page-tour-fixture.mjs'

const user={id:'11111111-1111-4111-8111-111111111111',username:'alice',fullName:'Alice James',role:'dual',skills:['Makeup','Tailoring'],talentCard:{mainTalent:'Makeup',workModes:['Gigs','Full-time'],availability:'available',featuredMedia:['4'],salary:{visibility:'private',min:200000,max:300000}}}
const hats={talent:[{id:'makeup',category:'Makeup',hat_title:'Bridal makeup'},{id:'tailoring',category:'Tailoring',hat_title:'Tailoring'}],client:[]}
const pixel='data:image/svg+xml,'+encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" width="300" height="300"><rect width="300" height="300" fill="#dce5ff"/></svg>')
const portfolio=[1,2,3,4].map((n)=>({id:String(n),hat_id:n===2?'tailoring':'makeup',type:'image',url:pixel,caption:'Work '+n}))
const errors=[],actions=[]
const server=await preview({preview:{host:'127.0.0.1',port:5189,strictPort:true}})
let browser
try {
  browser=await chromium.launch({headless:true,executablePath:process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH})
  const context=await browser.newContext({viewport:{width:1280,height:900},serviceWorkers:'block'})
  await optOutPageToursForFixture(context)
  const page=await context.newPage();page.setDefaultTimeout(60000)
  page.on('pageerror',error=>errors.push(error.message))
  await page.route('**/api/**',async route=>{
    const req=route.request(),url=new URL(req.url())
    let result={}
    if(req.method()==='PUT') {const body=req.postDataJSON();actions.push(body);Object.assign(user,body);result={user}}
    else if(url.pathname==='/api/users/alice') result={user,portfolio,hats}
    else if(url.searchParams.get('action')==='banks') result={banks:[]}
    else if(url.pathname==='/api/auth') result={user}
    else result={counts:{},associates:[],notifications:[],count:0,threads:[],conversations:[]}
    await route.fulfill({json:result})
  })
  await page.goto('http://127.0.0.1:5189/profile/alice?talent=tailoring',{waitUntil:'domcontentloaded',timeout:120000})
  console.log('Opened Talent Card preview')
  await page.getByRole('button',{name:'Tailoring',exact:true}).waitFor()
  assert.equal(await page.getByRole('button',{name:'Tailoring',exact:true}).getAttribute('aria-pressed'),'true')
  await page.getByRole('button',{name:'Work 2',exact:true}).waitFor()
  assert.equal(await page.getByRole('button',{name:'Work 1',exact:true}).count(),0)
  assert.equal(await page.getByText(/200,000|300,000/).count(),0)
  await page.getByRole('button',{name:'All',exact:true}).click()
  assert.equal(await page.getByRole('button',{name:/^Work [1-4]$/}).count(),3)
  await page.getByRole('button',{name:'Work 4',exact:true}).waitFor()
  await page.getByRole('button',{name:'Makeup · Main',exact:true}).click()
  assert.equal(new URL(page.url()).searchParams.get('talent'),'Makeup')
  await page.goBack()
  assert.equal(await page.getByRole('button',{name:'All',exact:true}).getAttribute('aria-pressed'),'true')
  await mkdir('test-results',{recursive:true})
  await page.screenshot({path:'test-results/talent-card-desktop.png',fullPage:true})
  await page.setViewportSize({width:390,height:844})
  assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true)
  await page.screenshot({path:'test-results/talent-card-mobile.png',fullPage:true})
  await page.getByRole('button',{name:'Edit Profile',exact:true}).click()
  console.log('Checking Talent Card editing')
  await page.getByLabel(/^Main talent/).selectOption('Tailoring')
  await page.getByLabel(/^Salary expectation visibility/).selectOption('tier')
  await page.getByLabel(/^Experience tier/).selectOption('Mid')
  await page.getByRole('button',{name:'Save changes',exact:true}).click()
  await page.getByRole('button',{name:'Tailoring · Main',exact:true}).waitFor()
  assert.equal(actions.at(-1).talentCard.mainTalent,'Tailoring')
  assert.equal(actions.at(-1).talentCard.salary.visibility,'tier')
  await page.getByText('Salary expectation: Mid level',{exact:true}).waitFor()
  assert.deepEqual(errors,[])
  console.log('Talent Card UI passed: deep link, filtering, featured works, history, salary privacy, mobile layout and saving preferences.')
} finally {await browser?.close();await new Promise(resolve=>server.httpServer.close(resolve))}
