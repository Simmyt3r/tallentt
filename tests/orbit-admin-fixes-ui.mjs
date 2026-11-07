import {chromium} from 'playwright'
import {createServer} from 'vite'
import {fileURLToPath} from 'node:url'
import {writeFile,unlink,mkdir} from 'node:fs/promises'
import assert from 'node:assert/strict'

const root=fileURLToPath(new URL('..',import.meta.url))
const fixtureName=`.orbit-ledger-ui-${process.pid}.html`
const fixturePath=new URL('../'+fixtureName,import.meta.url)
const user={id:'11111111-1111-4111-8111-111111111111',username:'audit_owner',fullName:'Audit Owner',full_name:'Audit Owner',role:'dual',isAdmin:true}
const base={created_at:'2026-11-06T08:00:00Z',client_username:'client',talent_username:'audit_owner',amount:60000,work_status:'in_progress'}
const dashboard={admin:{id:user.id},metrics:{users:2},statusCounts:{escrows:[{status:'not_funded',count:1}],
  work:[{status:'awaiting_funding',count:1,amount:60000},{status:'in_progress',count:1,amount:250000}]},
  lists:{escrows:[{...base,id:'00000000-0000-4000-8000-000000000001',status:'not_funded',hat_title:'Unfunded audit negotiation'},
    {...base,id:'00000000-0000-4000-8000-000000000002',status:'secured',hat_title:'Funded audit work',amount:250000}],
    walletTransactions:[{id:'received',username:'recipient',type:'wallet_transfer_received',amount:100000,balance_after:158000,status:'success',reference:'received-audit',created_at:base.created_at},
      {id:'sent',username:'sender',type:'wallet_transfer_sent',amount:100000,balance_after:257000,status:'success',reference:'sent-audit',created_at:base.created_at}]}}
await writeFile(fixturePath,`<html><head><meta name="viewport" content="width=device-width, initial-scale=1.0"></head><body style="margin:0;height:auto"><div id="root" style="max-width:1200px;margin:auto;padding:16px"></div><script type="module">
import React from 'react';import {createRoot} from 'react-dom/client';import {BrowserRouter} from 'react-router-dom';
import {AuthProvider} from '/src/context/AuthContext.jsx';import Admin from '/src/pages/Admin.jsx';
import ProfileHeader from '/src/components/profile/ProfileHeader.jsx';import ProfileScore from '/src/components/profile/ProfileScore.jsx';
import WorkPass from '/src/components/WorkPass.jsx';import BentoCard from '/src/components/BentoCard.jsx';import '/src/styles/index.css';
const user=${JSON.stringify(user)},view=new URLSearchParams(location.search).get('view');
const profile=React.createElement(React.Fragment,null,
 React.createElement(ProfileHeader,{user,isOwner:true,orbit:{score:123456},onEditClick:()=>{}}),
 React.createElement(ProfileScore,{orbit:{score:123456}}),
 React.createElement(BentoCard,{hat:{id:'audit-hat',user_id:user.id,username:user.username,full_name:user.fullName,role:'talent',hat_title:'Audit work',hat_name:'Audit work',media:[],rate:1000}}));
createRoot(document.getElementById('root')).render(React.createElement(BrowserRouter,null,
 React.createElement(AuthProvider,null,view==='profile'?profile:view==='workpass'?React.createElement(WorkPass,{username:user.username}):React.createElement(Admin))));
</script></body></html>`)
const server=await createServer({root,server:{host:'127.0.0.1',port:5185,strictPort:true}})
let browser
try{
 await server.listen()
 browser=await chromium.launch({headless:true,executablePath:process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH||undefined})
 const page=await browser.newPage({viewport:{width:1440,height:1000}}),errors=[]
 page.on('pageerror',e=>errors.push(e.message))
 await page.route('**/api/**',route=>{
  const url=new URL(route.request().url()),action=url.searchParams.get('action')
  if(url.pathname.endsWith('.js'))return route.continue()
  let data={}
  if(url.pathname==='/api/auth')data=action==='work_pass'?{
    user:{username:user.username,name:'Audit Owner',role:'dual',skills:[]},tier:'Diamond',orbit:123456,
    roleOrbit:{talent:{score:123456},client:{score:234567}},completedJobs:1000,successfulHires:1000,evidence:[],robots:[],endorsements:[],paidTrackingMonths:{talent:0,client:0},signatureStatus:'not_configured',printEligibility:{canPrint:false,reason:'No full-time employment'},
  }:{user}
  else if(url.pathname==='/api/users/audit_owner')data={user,orbit:{score:123456}}
  else if(url.pathname==='/api/admin'){
    if(action==='finance_summary')data={deal_commissions:{recorded:true,gross:'0',net:'0',reversed:'0',deals:0},liabilities:{},recognized_revenue:'0',income_streams:[]}
    else if(action==='finance_audit')data={recorded:true,transactions:[],next_cursor:null}
    else if(route.request().method()==='POST')data={recovered_fees:0,recovered_refunds:0}
    else data=dashboard
  }
  return route.fulfill({json:data})
 })
 const url=`http://127.0.0.1:5185/${fixtureName}`
 await page.goto(url+'?tab=finance')
 const received=page.getByRole('row').filter({hasText:'received-audit'})
 await received.waitFor()
 assert.match(await received.innerText(),/\+\s*₦100,000/)
 assert.match(await page.getByRole('row').filter({hasText:'sent-audit'}).innerText(),/-\s*₦100,000/)
 await page.getByRole('button',{name:'Deals & Escrow',exact:true}).click()
 const unfunded=page.getByRole('row').filter({hasText:'Unfunded audit negotiation'})
 assert.match(await unfunded.innerText(),/Awaiting Funding/)
 assert.doesNotMatch(await unfunded.innerText(),/In Progress/)
 assert.match(await page.getByRole('row').filter({hasText:'Funded audit work'}).innerText(),/In Progress/)
 await page.getByRole('button',{name:'Overview',exact:true}).click()
 await page.getByText(/^awaiting funding$/i).waitFor()
 await page.goto(url+'?view=profile')
 await page.getByLabel('Orbit score 123456.0',{exact:true}).waitFor()
 await page.getByText('Orbit 123456.0',{exact:true}).waitFor()
 assert.doesNotMatch(await page.locator('body').innerText(),/\/100|0–9/)
 await mkdir('test-results',{recursive:true})
 for(const width of [320,390,768,1440]){
  await page.setViewportSize({width,height:1000})
  assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true,`profile overflow ${width}`)
 }
 await page.goto(url+'?view=workpass')
 const roles=page.getByRole('region',{name:'Separate talent and client Orbit scores'})
 await roles.getByText('123456',{exact:true}).waitFor()
 await roles.getByText('234567',{exact:true}).waitFor()
 assert.doesNotMatch(await roles.innerText(),/0–9|\/100/)
 for(const width of [320,390,768,1440]){
  await page.setViewportSize({width,height:1000})
  assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true,`work pass overflow ${width}`)
 }
 await page.setViewportSize({width:390,height:1000})
 await page.screenshot({path:'test-results/uncapped-orbit-workpass.png',fullPage:true})
 assert.deepEqual(errors,[])
 console.log('Uncapped profile/Bento/Work Pass scores, received/sent transfer signs and unfunded admin statuses passed.')
}finally{await browser?.close();await server.close();await unlink(fixturePath)}
