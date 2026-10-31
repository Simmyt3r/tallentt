const escapeHtml=value=>String(value??'—').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]))
const date=value=>value?new Date(value).toLocaleString('en-NG',{dateStyle:'medium',timeStyle:'short'}):'Not yet recorded'
const money=(amount,currency='NGN')=>new Intl.NumberFormat('en-NG',{style:'currency',currency:currency||'NGN',maximumFractionDigits:0}).format(Number(amount||0))
export function createAgreementHtml(row,token,verifyUrl,qrData){
  const esc=escapeHtml
  const validPass=row.status==='secured'&&Boolean(token)
  const status=String(row.status||'').replaceAll('_',' ')
  const css=`html{color:#19223c;font:14px/1.55 Arial,sans-serif;background:#fff}body{margin:0;padding:0}main{max-width:820px;margin:auto;padding:34px}header{border-bottom:3px solid #0a13e6;padding-bottom:16px;margin-bottom:22px}h1{margin:6px 0;font-size:26px}h2{font-size:16px;color:#121d38;margin:23px 0 8px}p{margin:7px 0}.muted{color:#566071}.small{font-size:11px}.banner{padding:13px 16px;margin:15px 0;background:#eef0ff;border-left:4px solid #0a13e6}.warn{background:#fff4e8;border-left-color:#b87508}.meta{display:grid;grid-template-columns:1fr 1fr;gap:12px;margin:12px 0}.item{border-bottom:1px solid #ddd;padding:6px 0}.item strong{display:block}.verify{display:flex;gap:18px;align-items:center;margin-top:24px;border-top:1px solid #ddd;padding-top:20px}.qr{width:130px;height:130px;object-fit:contain}.foot{margin-top:26px;border-top:1px solid #ddd;padding-top:12px;color:#566071}@page{size:A4;margin:12mm}@media print{main{padding:0;max-width:none}.banner{print-color-adjust:exact;-webkit-print-color-adjust:exact}h2,.verify{break-inside:avoid}}`
  const block=(label,value)=>`<div class="item"><strong>${esc(label)}</strong>${esc(value)}</div>`
  return `<!DOCTYPE html><html lang="en"><head><meta charset="utf-8"><title>ChombuTar Agreement ${esc(row.id)}</title><style>${css}</style></head><body><main>
  <header><p style="font-weight:900;color:#0a13e6;letter-spacing:.09em">CHOMBUTAR · TRANSACTION RECORD</p>
  <h1>${validPass?'Service Agreement & Conditional Gate Pass':'Service Agreement Record'}</h1>
  <p class="muted">Agreement reference: ${esc(row.id)}</p></header>
  <div class="banner ${validPass?'':'warn'}"><strong>${validPass?'FUNDED · Verification required':'NOT AN ACTIVE ENTRY PASS'}</strong>
  <p>${validPass?'Funds are secured in escrow. Entry still requires confirmation of service location, identity and venue approval.':'This document is a draft or archived record. It does not grant access to a service location.'}</p></div>
  <h2>Parties</h2><div class="meta">
  ${block('Client',row.client_name+' (@'+row.client_username+')')}
  ${block('Talent',row.talent_name+' (@'+row.talent_username+')')}
  ${row.client_hat_title?block('Client account Hat (profile context)',row.client_hat_title):''}
  ${row.talent_hat_title?block('Talent account Hat (profile context)',row.talent_hat_title):''}
  </div>
  <p class="small muted">Account Hats are profile context; only the contracted service and recorded deal amount below define this transaction.</p>
  <h2>Service and consideration</h2><div class="meta">
  ${block('Hat / service',row.hat_title)}
  ${block('Talent category',row.category||row.hat_name||'As described in the Hat')}
  ${block('Agreed amount',money(row.amount,row.currency)+(row.pay_unit?' / '+row.pay_unit:''))}
  ${block('Service area',row.hat_lga||'Location to be confirmed between the parties')}
  ${block('Booking created',date(row.created_at))}
  ${block('Price agreed',date(row.agreed_at))}
  ${block('Escrow funded',date(row.funded_at))}
  ${block('Current deal status at issue',status)}
  </div>
  <h2>Platform escrow and service protections</h2>
  <p>After funding, the agreed amount is held in ChombuTar's booking escrow flow. The client generates a time-limited Start QR when work begins; the verified Start checkpoint releases the applicable initial portion to talent. The remaining escrow is released after the work delivery, approval and Completion QR checkpoint, subject to disputes and applicable platform rules.</p>
  <p>Both parties may review recorded deal messages, offer history and booking events. Disputes may pause settlement; any remaining escrow is released or refunded only by the platform's authorized settlement process. An unfunded booking may be cancelled and kept in history.</p>
  <h2>Platform conditions and evidence</h2>
  <p>Both parties' use of the service is subject to the applicable ChombuTar Terms and booking/escrow conditions. No handwritten or separate electronic signature is collected on this generated record. It summarizes database entries; it does not itself prove when either party accepted a particular version of the platform terms. Actual enforceability depends on the applicable law, agreement and evidence.</p>
  <p>ChombuTar is not automatically the employer or a party to the underlying service contract. The agreed service location, access authorization, identity matching, safe working conditions and any site-specific requirements remain the parties' and venue's responsibility.</p>
  <div class="verify"><div>${token&&qrData?`<img class="qr" src="${esc(qrData)}" alt="Scan to verify the current deal status" />`:''}</div><div><strong>Online authenticity check</strong>
  <p class="small">Scan this QR or enter the link below. This document's signed reference is checked against the live ChombuTar deal status; copied or cancelled passes cannot grant entry.</p>
  <p class="small" style="word-break:break-all">${token?esc(verifyUrl):'A signed verification code is issued after escrow funding.'}</p></div></div>
  <p class="foot small">Generated from authenticated ChombuTar account and booking records. Copies can become stale; always verify online. A printed copy is evidence of a platform record, not a government ID, employment authorization, or guaranteed security clearance.</p>
  </main></body></html>`
}
