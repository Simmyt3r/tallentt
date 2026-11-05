import test from 'node:test'
import assert from 'node:assert/strict'
import {readFileSync} from 'node:fs'
import {createAgreementHtml} from '../src/lib/dealAgreementDocument.js'

const read=path=>readFileSync(new URL('../'+path,import.meta.url),'utf8')

test('Agreement screen no longer shows back arrow or outlined page controls',()=>{
  const page=read('src/pages/DealAgreement.jsx')
  assert.doesNotMatch(page,/ArrowLeft|Back to Deal details|<Link/)
  assert.match(page,/<h1 className="text-\[21px\] font-black">Agreement<\/h1>/)
  assert.match(page,/className="pb-1"/)
  assert.match(page,/className="h-\[900px\] w-full border-0 bg-white"/)
  assert.doesNotMatch(page,/border-b border-black\/10|border border-black\/15|rounded-xl border /)
  assert.match(page,/getDealAgreement\(dealId\)/)
  assert.match(page,/createAgreementHtml\(record\.agreement,token,verifyUrl,qr\)/)
  assert.match(page,/QRCode\.toDataURL/)
  assert.match(page,/Download \(\.html\)/)
  assert.match(page,/Print \/ Save as PDF/)
  assert.match(page,/role="alert"/)
})

test('Generated agreement remains printable and verifiable without decorative border lines',()=>{
  const html=createAgreementHtml({
    id:'00000000-0000-4000-8000-000000000000',
    status:'secured',
    work_status:'awaiting_start',
    client_name:'Example client',client_username:'client',
    talent_name:'Example talent',talent_username:'talent',
    hat_title:'Sample service',category:'Services',currency:'NGN',
    amount:1000,created_at:'2026-11-01T10:00:00Z'
  },'test-verification-token','https://example.com/deals/verify-agreement?token=test','data:image/png;base64,AA==')
  assert.match(html,/Service Agreement & Conditional Gate Pass/)
  assert.match(html,/Agreement reference:/)
  assert.match(html,/Online authenticity check/)
  assert.match(html,/Scan to verify the current deal status/)
  assert.match(html,/<style>/)
  assert.match(html,/@media print/)
  assert.doesNotMatch(html,/border(?:-left|-right|-top|-bottom)?:/)
  assert.match(html,/print-color-adjust:exact/)
})
