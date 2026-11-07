import {chromium} from 'playwright'
import {createServer} from 'vite'
import assert from 'node:assert/strict'
import {mkdir,writeFile,unlink} from 'node:fs/promises'
import {fileURLToPath} from 'node:url'

const summary={deal_commissions:{recorded:true,gross:'1000',reversed:'350',net:'650',deals:2},
  liabilities:{},recognized_revenue:'850',income_streams:[
    {id:'live_support',name:'Live support platform fees',recorded:true,transactions:1,inflow:'200'},
    {id:'deal_fees',name:'Deal commissions',recorded:true,transactions:2,inflow:'650'},
    {id:'salary_tracking',name:'Client salary tracking',recorded:true,
      transactions:1,inflow:'1000',recognition:'pending',unmatched_charges:1,source:'billing_charge_events'},
  ]}
const deal={id:'11111111-1111-4111-8111-111111111111',deal_title:'Electrical repair',deal_amount:'10000',
  client_username:'test_client',talent_username:'test_talent',status:'refunded',work_status:'refunded',
  commission_gross:'500',commission_reversed:'350',commission_net:'150',refunded_gross:'7000',
  created_at:'2026-11-01T10:00:00Z',reversed_at:'2026-11-01T10:00:00Z',
  events:[{id:'33333333-3333-4333-8333-333333333333',stage:'sealed',rate_bps:500,
    fee_amount:'500',gross_amount:'10000',created_at:'2026-10-31T10:00:00Z',source_transaction_id:'recovered-wallet-transaction'}]}
const older={...deal,id:'22222222-2222-4222-8222-222222222222',deal_title:'Logo design',commission_reversed:'0',commission_net:'500',reversed_at:null}
const uncharged={...older,id:'44444444-4444-4444-8444-444444444444',deal_title:'Earlier fee-free deal',events:[],commission_status:'not_collected',commission_gross:'0',commission_net:'0'}
const fixtureName=`.commission-ui-${process.pid}.html`
const root=fileURLToPath(new URL('..',import.meta.url))
const fixturePath=new URL('../'+fixtureName,import.meta.url)
await writeFile(fixturePath,`<html><head><meta name="viewport" content="width=device-width, initial-scale=1.0"></head><body style="margin:0;height:auto"><div id="root"></div><script type="module">
  import React from 'react';
  import {createRoot} from 'react-dom/client';
  import AdminFinanceLedger from '/src/components/AdminFinanceLedger.jsx';
  import '/src/styles/index.css';
  createRoot(document.getElementById('root')).render(React.createElement(AdminFinanceLedger));
</script></body></html>`)
const server=await createServer({root,server:{host:'127.0.0.1',port:5182,strictPort:true}})
let browser
try{
  await server.listen()
  browser=await chromium.launch({headless:true,executablePath:process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH||undefined})
  const page=await browser.newPage({viewport:{width:1280,height:900}})
  const errors=[]
  page.on('pageerror',error=>errors.push(error.message))
  let mode='normal',reconciliations=0
  await page.route('**/api/admin**',async route=>{
    if(route.request().method()==='POST'){
      reconciliations++
      return mode==='sync_error'?route.fulfill({status:500,json:{error:'Reconciliation unavailable'}}):route.fulfill({json:{recovered_fees:0,recovered_refunds:0}})
    }
    const params=new URL(route.request().url()).searchParams
    if(params.get('action')==='finance_summary')return route.fulfill({json:summary})
    if(params.get('action')==='finance_integrity')return route.fulfill({json:{
      recorded:true,total_exceptions:2,sample_limited:false,gateway_settlement:{status:'unverified',records_checked:false},
      counts:[{issue:'charge_unverified',count:1},{issue:'orphan_wallet_refund',count:1}],
      sample:[{issue:'charge_unverified',record_id:'integrity-record',kind:'salary_tracking',
        username:'affected_client',amount:1000,reference:'integrity:record',occurred_at:deal.created_at}],
      note:'Read-only internal journal review; settlement is not verified.',
    }})
    if(params.get('stream')==='salary_tracking')return route.fulfill({json:{recorded:true,next_cursor:null,transactions:[{
      id:'billing-fee',source_id:'55555555-5555-4555-8555-555555555555',username:'biller',
      created_at:deal.created_at,amount:1000,status:'charged',matching_debits:1,matching_refunds:0,
      wallet_evidence:'charged_verified',reference:'salary-track:record',
    }]}})
    if(params.get('stream')==='live_support')return route.fulfill({json:{recorded:true,next_cursor:null,transactions:[{
      id:'live-fee',created_at:deal.created_at,supporter_username:'live_supporter',talent_username:'live_talent',
      gross_amount:2000,platform_fee:200,net_amount:1800,
    }]}})
    if(mode==='error')return route.fulfill({status:500,json:{error:'Commission report temporarily unavailable'}})
    if(mode==='missing')return route.fulfill({json:{recorded:false,transactions:[],next_cursor:null}})
    if(mode==='empty')return route.fulfill({json:{recorded:true,transactions:[],next_cursor:null}})
    return route.fulfill({json:{recorded:true,transactions:params.has('cursor')?[older,uncharged]:[deal],next_cursor:params.has('cursor')?null:deal.id}})
  })
  await page.goto(`http://127.0.0.1:5182/${fixtureName}`)
  await page.getByRole('heading',{name:'Service charges by deal',exact:true}).waitFor()
  await page.getByRole('cell',{name:'Client: test_client Talent: test_talent'}).waitFor()
  assert.equal(reconciliations,0) // viewing Admin Finance is read-only
  assert.match(await page.getByRole('region',{name:'Deal service charge earnings'}).innerText(),/₦650/)
  await page.getByRole('button',{name:'Run read-only check',exact:true}).click()
  await page.getByText('2 potential billing-journal issue(s) require review.',{exact:true}).waitFor()
  await page.getByText('affected_client',{exact:true}).waitFor()
  await page.getByText(/Bank \/ Paystack settlement:/).waitFor()
  assert.equal(reconciliations,0)
  await page.getByText('View fee records',{exact:true}).click()
  await page.getByText('sealed · 5%',{exact:true}).waitFor()
  await page.getByText('Service charge reversal: ₦350',{exact:true}).waitFor()
  await page.getByText(/Recovered from transaction: recovered-wallet-transaction/).waitFor()
  await page.getByRole('button',{name:'Load older deals',exact:true}).click()
  await page.getByText('Logo design',{exact:true}).waitFor()
  await page.getByText('No service charge was collected on this earlier deal.',{exact:true}).waitFor()
  assert.equal(await page.getByRole('button',{name:'Load older deals'}).count(),0)
  await mkdir('test-results',{recursive:true})
  for(const width of [320,390,768,1280]){
    await page.setViewportSize({width,height:900})
    assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true,`page overflows at ${width}px`)
    await page.screenshot({path:`test-results/admin-commissions-${width}.png`,fullPage:true})
  }
  await page.getByRole('button',{name:'Audit trail',exact:true}).first().click()
  await page.getByRole('heading',{name:'Live support fee audit trail',exact:true}).waitFor()
  await page.getByText('live_supporter / live_talent',{exact:true}).waitFor()
  await page.getByRole('button',{name:'Close audit',exact:true}).click()
  assert.equal(await page.getByRole('region',{name:'Platform fee accrual audit'}).count(),0)
  await page.getByText('Client salary tracking',{exact:true}).waitFor()
  await page.getByText(/1 charge\(s\) have missing\/duplicate debit evidence or an unexpected wallet refund/).waitFor()
  await page.getByRole('button',{name:'Audit trail',exact:true}).last().click()
  await page.getByRole('heading',{name:'Client salary tracking charge audit'}).waitFor()
  await page.getByText('Matched wallet charge',{exact:true}).waitFor()
  await page.getByRole('button',{name:'Close audit',exact:true}).click()
  await page.getByRole('button',{name:'View service charges by deal',exact:true}).click()
  await page.getByText('Electrical repair',{exact:true}).waitFor()
  for(const [next,text] of [['empty','No deal service charges recorded yet.'],['missing','Service charge records are unavailable. Apply the billing migration in Database Migrations.'],['error','Commission report temporarily unavailable']]){
    mode=next
    await page.getByRole('button',{name:'Refresh',exact:true}).click()
    if(next==='error')await page.getByRole('alert').filter({hasText:text}).waitFor()
    else await page.getByText(text,{exact:true}).waitFor()
  }
  mode='normal'
  await page.getByRole('button',{name:'Retry',exact:true}).click()
  await page.getByText('Electrical repair',{exact:true}).waitFor()
  // Refresh must never issue a write or invoke historical reconciliation.
  mode='sync_error'
  await page.getByRole('button',{name:'Refresh',exact:true}).click()
  await page.getByText('Electrical repair',{exact:true}).waitFor()
  assert.equal(reconciliations,0)
  let consent=false
  page.on('dialog',async dialog=>{if(consent)await dialog.accept();else await dialog.dismiss()})
  await page.getByRole('button',{name:'Reconcile verified receipts'}).click()
  assert.equal(reconciliations,0) // cancelled explicit confirmation
  consent=true
  await page.getByRole('button',{name:'Reconcile verified receipts'}).click()
  await page.getByRole('alert').filter({hasText:'Reconciliation unavailable'}).waitFor()
  assert.equal(reconciliations,1)
  mode='normal'
  await page.getByRole('button',{name:'Reconcile verified receipts'}).click()
  await page.getByText('Verified receipt recovery complete: 0 service charges and 0 refund reversals.',{exact:false}).waitFor()
  assert.equal(reconciliations,2)
  await page.getByRole('button',{name:'Refresh',exact:true}).click()
  await page.getByText('Electrical repair',{exact:true}).waitFor()
  assert.equal(reconciliations,2)
  assert.deepEqual(errors,[])
  console.log('Admin commission UI passed: read-only refresh, explicit confirmed reconciliation, mobile/desktop, fee detail and pagination.')
}finally{
  await browser?.close()
  await server.close()
  await unlink(fixturePath)
}
