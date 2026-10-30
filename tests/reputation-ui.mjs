import assert from 'node:assert/strict'
import {chromium} from 'playwright'
import {preview} from 'vite'
import {optOutPageToursForFixture} from './page-tour-fixture.mjs'
const server=await preview({preview:{host:'127.0.0.1',port:5190,strictPort:true}})
let browser
try{
 browser=await chromium.launch({headless:true,executablePath:process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH})
 const context=await browser.newContext({viewport:{width:390,height:844},serviceWorkers:'block'})
 await optOutPageToursForFixture(context)
 const page=await context.newPage();page.setDefaultTimeout(60000)
 const errors=[],actions=[];page.on('pageerror',e=>errors.push(e.message))
 const reputation={talent:{points:60,level:0},employer:{points:100,level:1},talents:[{talent:'Tailoring',points:60,level:0}],ratings:[],reviews:[],reliability:{on_time:2,confirmed:3}}
 await page.route('**/api/**',async route=>{
  const req=route.request(),url=new URL(req.url());let result={threads:[],conversations:[],counts:{},count:0}
  if(req.method()==='POST'&&req.postDataJSON()?.action==='review_submit'){
   const body=req.postDataJSON();actions.push(body);reputation.reviews=[{id:'review',stars:body.stars,body:body.body,talent:'Tailoring',reviewer_username:'client'}];result={ok:true}
  }else if(url.pathname==='/api/auth')result={user:{id:'client',username:'client',fullName:'Client',role:'client'}}
  else if(url.pathname==='/api/users/talent')result={user:{id:'talent',username:'talent',fullName:'Talent',role:'talent',skills:[]},hats:{talent:[],client:[]},portfolio:[],reputation}
  else if(url.searchParams.has('review_jobs'))result={jobs:actions.length?[]:[{id:'completed',hat_title:'Tailoring job'}]}
  await route.fulfill({json:result})
 })
 await page.goto('http://127.0.0.1:5190/profile/talent',{waitUntil:'domcontentloaded',timeout:120000})
 await page.getByRole('tab',{name:'Reviews',exact:true}).click()
 await page.getByRole('heading',{name:'Lifetime work reputation'}).waitFor()
 await page.getByLabel('Completed job to review').selectOption('completed')
 await page.getByLabel('Public work review').fill('Excellent craftsmanship.')
 await page.getByRole('button',{name:'Publish review',exact:true}).click()
 await page.getByText('Excellent craftsmanship.',{exact:true}).waitFor()
 assert.equal(actions.length,1);assert.equal(actions[0].stars,5)
 assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true)
 assert.deepEqual(errors,[])
 console.log('Review submission and mobile reputation display passed.')
}finally{await browser?.close();await new Promise(r=>server.httpServer.close(r))}
