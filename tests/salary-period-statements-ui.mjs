import {chromium} from 'playwright'
import {createServer} from 'vite'
import assert from 'node:assert/strict'
import {writeFile,unlink} from 'node:fs/promises'
import {fileURLToPath} from 'node:url'

const fixtureName='.salary-statement-ui-'+process.pid+'.html'
const file=new URL('../'+fixtureName,import.meta.url)
const root=fileURLToPath(new URL('..',import.meta.url))
const statement={
  available:true,
  note:'Current internal tracking receipts; not an invoice or independent bank payment proof.',
  entries:[
    {side:'client',status:'wallet_charge_recorded',amount:1000,
      reference:'salary-track:2026-11:client',receipt_id:'receipt-client',
      charged_at:'2026-11-01T10:00:00Z'},
    {side:'talent',status:'wallet_refund_recorded',amount:1000,
      reference:'salary-track:2026-11:talent',receipt_id:'receipt-talent',
      charged_at:'2026-11-01T10:00:00Z',refunded_at:'2026-11-02T10:00:00Z'},
  ],
}
await writeFile(file,`<html><head><meta name="viewport" content="width=device-width,initial-scale=1"></head>
  <body><div id="root"></div><script type="module">
    import React from 'react';
    import {createRoot} from 'react-dom/client';
    import {MonthlyTrackingStatement} from '/src/pages/Employment.jsx';
    import '/src/styles/index.css';
    const data=${JSON.stringify(statement)};
    createRoot(document.getElementById('root')).render(
      React.createElement('main',{className:'mx-auto max-w-lg px-4 py-5'},
        React.createElement(MonthlyTrackingStatement,{statement:data,month:'2026-11'})));
  </script></body></html>`)
const server=await createServer({root,server:{host:'127.0.0.1',port:5185,strictPort:true}})
let browser
try{
  await server.listen()
  browser=await chromium.launch({headless:true,executablePath:process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH||undefined})
  const page=await browser.newPage({viewport:{width:1280,height:900}})
  const errors=[]
  page.on('pageerror',e=>errors.push(e.message))
  await page.goto('http://127.0.0.1:5185/'+fixtureName)
  await page.getByText('View monthly tracking fee statement',{exact:true}).click()
  await page.getByText('Client fee',{exact:true}).waitFor()
  await page.getByText('Talent fee',{exact:true}).waitFor()
  await page.getByText('Paid · internal wallet debit matched',{exact:true}).waitFor()
  await page.getByText('Refunded · internal wallet credit matched',{exact:true}).waitFor()
  await page.getByText('Reference: salary-track:2026-11:talent',{exact:true}).waitFor()
  await page.getByText(/not an invoice or independent bank payment proof/).waitFor()
  for(const width of [320,390,768,1280]){
    await page.setViewportSize({width,height:900})
    assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true,
      'Monthly private statements overflow viewport '+width)
  }
  assert.deepEqual(errors,[])
  console.log('Monthly salary tracking statement UI passed: both roles, refund, source reference and responsive widths.')
}finally{
  await browser?.close()
  await server.close()
  await unlink(file)
}
