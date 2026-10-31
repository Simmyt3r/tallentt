import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
global.__tworldPool ||= {query:()=>{throw Error('Unexpected database access in pure policy test')}}
const { workPassPrintPolicy } = await import('../api/_lib/workPassPrint.js')

const fullTime=(id='job-1',overrides={})=>({id,status:'active',start_on:'2026-09-01',due_day:25,ended_on:null,...overrides})
const paid=(agreement_id,month,overrides={})=>({agreement_id,month,status:'confirmed',client_paid:true,talent_paid:true,...overrides})
const assess=(agreements,periods,today='2026-10-31')=>workPassPrintPolicy({agreements,periods,today})

test('no employment or no salary month due does not unlock Work Pass printing',()=>{
  assert.equal(assess([],[]).canPrint,false)
  const p=assess([fullTime('future',{start_on:'2026-10-30',due_day:31})],[],'2026-10-30')
  assert.equal(p.canPrint,false)
  assert.equal(p.dueMonths,0)
})
test('every due month of full-time employment needs confirmed salary and both paid tracking fees',()=>{
  const a=fullTime()
  const full=[paid(a.id,'2026-09'),paid(a.id,'2026-10')]
  assert.deepEqual(assess([a],full),{
    canPrint:true,dueMonths:2,paidMonths:2,outstandingMonths:0,
    reason:'All due salary months have confirmed, fully paid tracking fees.',
  })
  const unpaidTalent=assess([a],[full[0],paid(a.id,'2026-10',{talent_paid:false})])
  assert.equal(unpaidTalent.canPrint,false)
  assert.equal(unpaidTalent.outstandingMonths,1)
  assert.equal(assess([a],[paid(a.id,'2026-09')]).canPrint,false,'missing salary report blocks printing')
  assert.equal(assess([a],[paid(a.id,'2026-09'),paid(a.id,'2026-10',{client_paid:false})]).canPrint,false)
  assert.equal(assess([a],[paid(a.id,'2026-09'),paid(a.id,'2026-10',{status:'disputed'})]).canPrint,false)
})
test('multiple full-time agreements aggregate all obligations, never just best paid agreement',()=>{
  const a=fullTime('first'),b=fullTime('second')
  const partial=[paid('first','2026-09'),paid('first','2026-10')]
  assert.deepEqual(assess([a,b],partial).outstandingMonths,2)
  assert.equal(assess([a,b],[...partial,paid('second','2026-09'),paid('second','2026-10')]).canPrint,true)
})
test('closed employment does not invent future obligations; missing valid agreement date fails closed',()=>{
  const ended=fullTime('ended',{status:'ended',ended_on:'2026-09-30'})
  const allowed=assess([ended],[paid('ended','2026-09')])
  assert.equal(allowed.canPrint,true)
  assert.equal(allowed.dueMonths,1)
  const blocked=assess([fullTime('bad',{due_day:99}),ended],[paid('ended','2026-09')])
  assert.equal(blocked.canPrint,false)
})
test('short months clamp salary due date; no print prior to due date',()=>{
  const feb=fullTime('feb',{start_on:'2026-02-01',due_day:31})
  assert.equal(assess([feb],[],'2026-02-27').dueMonths,0)
  assert.equal(assess([feb],[paid('feb','2026-02')],'2026-02-28').canPrint,true)
})
test('only signed-in owners receive printing permission, not anonymous public Work Pass readers',()=>{
  const backend=readFileSync(new URL('../api/_lib/workPass.js',import.meta.url),'utf8')
  const endpoint=readFileSync(new URL('../api/auth/index.js',import.meta.url),'utf8')
  const ui=readFileSync(new URL('../src/components/WorkPass.jsx',import.meta.url),'utf8')
  assert.match(backend,/viewerId===user.id/)
  assert.match(backend,/workPassPrintEligibility\(user.id\)/)
  assert.match(endpoint,/getWorkPass\(url.searchParams.get\('username'\),getSessionUser\(req\)\?\.sub/)
  assert.match(ui,/printEligibility\?\.canPrint===true/)
  assert.match(ui,/const fresh=await api.getWorkPass\(username\)/)
  assert.match(ui,/if\(!canPrint \|\| printing\) return/)
  assert.match(ui,/workpass-print-eligible/)
})
