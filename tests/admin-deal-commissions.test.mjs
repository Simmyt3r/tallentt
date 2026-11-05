import test,{before,after} from 'node:test'
import assert from 'node:assert/strict'
import {randomUUID} from 'node:crypto'
import {readFile} from 'node:fs/promises'
import {testDatabase} from './database.mjs'

let database,pool,financeSummary,financeAudit,handler,signSession
const adminId=randomUUID(),clientId=randomUUID(),talentId=randomUUID(),hatId=randomUUID()
const sealedId=randomUUID(),legacyId=randomUUID(),refundedId=randomUUID(),noFeeId=randomUUID()
before(async()=>{
  database=await testDatabase();pool=database.pool;global.__tworldPool=pool
  process.env.JWT_SECRET='admin-commission-test-secret'
  for(const file of ['schema.sql','patch-employment-2026-10.sql','patch-monetization-2026-10.sql','patch-dual-role-billing-2026-10.sql'])
    await pool.query(await readFile(new URL('../db/'+file,import.meta.url),'utf8'))
  for(const [id,name] of [[adminId,'commission_admin'],[clientId,'commission_client'],[talentId,'commission_talent']])
    await pool.query(`INSERT INTO users(id,full_name,username,email,password_hash,is_admin)
      VALUES($1,$2,$2,$3,'test',$4)`,[id,name,name+'@example.test',id===adminId])
  await pool.query(`INSERT INTO hats(id,user_id,username,hat_name,hat_title,category)
    VALUES($1,$2,'commission_talent','Repairs','Electrical repair','Repairs')`,[hatId,talentId])
  for(const id of [sealedId,legacyId,refundedId,noFeeId])
    await pool.query(`INSERT INTO escrows(id,hat_id,client_id,talent_id,amount,status,work_status)
      VALUES($1,$2,$3,$4,10000,'secured','awaiting_start')`,[id,hatId,clientId,talentId])
  for(const [id,stage,gross,fee] of [[sealedId,'sealed',10000,500],[legacyId,'start',3000,150],
    [legacyId,'completion',7000,350],[refundedId,'sealed',10000,500]])
    await pool.query(`INSERT INTO gig_fee_events(escrow_id,stage,gross_released,fee_amount,rate_bps,created_at)
      VALUES($1,$2,$3,$4,500,'2026-01-01')`,[id,stage,gross,fee])
  await pool.query(`INSERT INTO gig_commission_adjustments(escrow_id,refunded_gross,commission_reversed,created_at)
    VALUES($1,7000,350,'2026-02-01')`,[sealedId])
  await pool.query(`INSERT INTO gig_commission_adjustments(escrow_id,refunded_gross,commission_reversed,created_at)
    VALUES($1,10000,500,'2026-02-02')`,[refundedId])
  await pool.query(`UPDATE escrows SET status='refunded',work_status='refunded' WHERE id IN ($1,$2)`,[sealedId,refundedId])
  ;({financeSummary,financeAudit}=await import('../api/_lib/financeReporting.js'))
  handler=(await import('../api/admin/index.js')).default
  signSession=(await import('../api/_lib/auth.js')).signSession
})
after(async()=>{await database?.close();delete global.__tworldPool})

async function request(userId,params='action=finance_audit&stream=deal_fees'){
  const req={method:'GET',url:'/api/admin?'+params,headers:{host:'localhost',
    cookie:userId?'cw_session='+signSession({sub:userId}):''}}
  const res={statusCode:200,headers:{},setHeader(k,v){this.headers[k]=v},end(body){this.body=JSON.parse(body)}}
  await handler(req,res)
  return res
}

test('only admins can read commission summaries or deal audit records',async()=>{
  for(const params of ['action=finance_summary','action=finance_audit&stream=deal_fees']){
    assert.equal((await request(null,params)).statusCode,401)
    assert.equal((await request(clientId,params)).statusCode,403)
    const result=await request(adminId,params)
    assert.equal(result.statusCode,200)
    assert.equal(result.headers['Cache-Control'],'private, no-store')
  }
})

test('each row identifies its deal and parties; milestones aggregate and refunds reverse once',async()=>{
  const audit=await financeAudit({stream:'deal_fees'})
  assert.equal(audit.recorded,true)
  assert.equal(audit.transactions.length,4,'paid deals without a collected fee remain visible')
  const uncharged=audit.transactions.find(row=>row.id===noFeeId)
  assert.equal(uncharged.commission_status,'not_collected')
  assert.equal(uncharged.commission_net,'0')
  const byId=Object.fromEntries(audit.transactions.map(row=>[row.id,row]))
  const sealed=byId[sealedId]
  assert.equal(sealed.deal_title,'Electrical repair')
  assert.equal(sealed.client_username,'commission_client')
  assert.equal(sealed.talent_username,'commission_talent')
  assert.equal(sealed.deal_amount,'10000')
  assert.equal(sealed.commission_gross,'500')
  assert.equal(sealed.commission_reversed,'350')
  assert.equal(sealed.commission_net,'150')
  assert.equal(sealed.refunded_gross,'7000')
  assert.equal(sealed.events[0].stage,'sealed')
  assert.equal(sealed.events[0].rate_bps,500)
  assert.equal(byId[legacyId].events.length,2)
  assert.equal(byId[legacyId].commission_net,'500')
  assert.equal(byId[refundedId].commission_net,'0')
  const summary=await financeSummary()
  assert.deepEqual(summary.deal_commissions,{recorded:true,gross:'1500',reversed:'850',net:'650',deals:3,unrecorded_deals:1})
  const sum=key=>audit.transactions.reduce((total,row)=>total+BigInt(row[key]),0n).toString()
  assert.equal(sum('commission_gross'),summary.deal_commissions.gross)
  assert.equal(sum('commission_reversed'),summary.deal_commissions.reversed)
  assert.equal(sum('commission_net'),summary.deal_commissions.net)
  assert.equal(summary.recognized_revenue,'650')
  assert.equal(summary.income_streams.find(row=>row.id==='deal_fees').inflow,'650')
})

test('a refund is subtracted once from a deal with multiple fee events',async()=>{
  await pool.query(`INSERT INTO gig_commission_adjustments(escrow_id,refunded_gross,commission_reversed)
    VALUES($1,2000,100)`,[legacyId])
  try{
    const audit=await financeAudit({stream:'deal_fees'})
    const row=audit.transactions.find(row=>row.id===legacyId)
    assert.equal(row.events.length,2)
    assert.equal(row.commission_gross,'500')
    assert.equal(row.commission_reversed,'100')
    assert.equal(row.commission_net,'400')
    assert.equal((await financeSummary()).deal_commissions.net,'550')
  }finally{await pool.query('DELETE FROM gig_commission_adjustments WHERE escrow_id=$1',[legacyId])}
})

test('commission reporting remains available before refund adjustment migration',async()=>{
  await pool.query('ALTER TABLE gig_commission_adjustments RENAME TO hidden_adjustments')
  try{
    const audit=await financeAudit({stream:'deal_fees'})
    assert.ok(audit.transactions.every(row=>row.commission_reversed==='0'&&row.reversed_at===null))
    assert.equal((await financeSummary()).deal_commissions.net,'1500')
  }finally{await pool.query('ALTER TABLE hidden_adjustments RENAME TO gig_commission_adjustments')}
})

test('deal pagination uses stable timestamp and ID ordering without repeats',async()=>{
  for(let i=0;i<28;i++){
    const id=randomUUID()
    await pool.query(`INSERT INTO escrows(id,hat_id,client_id,talent_id,amount,status,work_status)
      VALUES($1,$2,$3,$4,1000,'secured','awaiting_start')`,[id,hatId,clientId,talentId])
    await pool.query(`INSERT INTO gig_fee_events(escrow_id,stage,gross_released,fee_amount,rate_bps,created_at)
      VALUES($1,'sealed',1000,50,500,'2026-03-01')`,[id])
  }
  const first=await financeAudit({stream:'deal_fees'})
  assert.equal(first.transactions.length,25)
  assert.equal(first.next_cursor,first.transactions.at(-1).id)
  const next=await financeAudit({stream:'deal_fees',cursor:first.next_cursor})
  assert.equal(next.transactions.length,7)
  assert.equal(next.next_cursor,null)
  assert.equal(new Set([...first.transactions,...next.transactions].map(row=>row.id)).size,32)
  assert.equal((await financeAudit({stream:'deal_fees',cursor:randomUUID()})).transactions.length,0)
  await assert.rejects(financeAudit({stream:'deal_fees',cursor:"'; DROP TABLE escrows"}),error=>error.status===400)
  assert.equal((await request(adminId,'action=finance_audit&stream=deal_fees&cursor=invalid')).statusCode,400)
})
