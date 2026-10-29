import test from 'node:test'
import assert from 'node:assert/strict'
import {randomUUID} from 'node:crypto'
import {readFile} from 'node:fs/promises'
import {Readable} from 'node:stream'
import {testDatabase} from './database.mjs'
const setupDb=await testDatabase();global.__tworldPool=setupDb.pool
const {employmentTerms,employmentToday,salaryDueOn}=await import('../api/_lib/employment.js')

test('employment terms and monthly dates validate without inventing payment proof',()=>{
  assert.equal(employmentToday(new Date('2026-10-31T23:30:00Z')),'2026-11-01')
  assert.equal(salaryDueOn('2026-02',31,'2026-01-01'),'2026-02-28')
  assert.equal(salaryDueOn('2028-02',31,'2028-01-01'),'2028-02-29')
  assert.equal(salaryDueOn('2026-02',1,'2026-02-15'),'2026-02-15')
  assert.throws(()=>employmentTerms({role:'Tailor',talent:'Tailoring',salary:200000,due_day:28,notice_days:14,work_mode:'Remote',start_on:'2026-02-30'}),/start date/)
})

test('private employment and salary lifecycle',async t=>{
  const db=setupDb;global.__tworldPool=db.pool
  const {employmentAction:act,employmentGet:get,publicEmploymentSummary:summary}=await import('../api/_lib/employment.js')
  const employer=randomUUID(),talent=randomUUID(),outsider=randomUUID()
  const today=employmentToday(),month=today.slice(0,7)
  const older=new Date(today);older.setUTCMonth(older.getUTCMonth()-2,1)
  const start=older.toISOString().slice(0,10),oldMonth=start.slice(0,7)
  const terms={role:'Full-time tailor',talent:'Tailoring',salary:200000,due_day:28,notice_days:14,work_mode:'On-site',start_on:start,description:'Design and sew garments',location:'Lagos'}
  const command=(action,body={})=>({action,command_id:randomUUID(),...body})
  const load=(who,id)=>get(who,new URLSearchParams({employment_id:id}))
  let agreement,firstPeriod,second
  try{
    await t.test('rollout is optional for existing inboxes and migration can replay',async()=>{
      assert.deepEqual(await get(employer,new URLSearchParams()),{threads:[],available:false})
      await db.pool.query(await readFile(new URL('../db/schema.sql',import.meta.url),'utf8'))
      const patch=await readFile(new URL('../db/patch-employment-2026-10.sql',import.meta.url),'utf8')
      await db.pool.query(patch);await db.pool.query(patch)
      for(const [uid,name,role] of [[employer,'employer','client'],[talent,'talent','talent'],[outsider,'outsider','dual']])await db.pool.query("INSERT INTO users(id,username,full_name,email,password_hash,role) VALUES($1,$2,$2,$3,'test',$4)",[uid,name,name+'@example.test',role])
      for(const uid of [talent,outsider])await db.pool.query("INSERT INTO hats(user_id,username,hat_title,hat_name,category,role) VALUES($1,'talent','Tailoring','Studio','Tailoring','talent')",[uid])
    })
    await t.test('only employer accounts create drafts; draft and command retry stay private',async()=>{
      await assert.rejects(act(talent,command('employment_create',{talent_id:outsider,terms})),/Client Card/)
      await assert.rejects(act(employer,command('employment_create',{talent_id:employer,terms})),/another/)
      const request=command('employment_create',{talent_id:talent,terms})
      const result=await act(employer,request);agreement=result.agreement_id
      assert.deepEqual(await act(employer,request),result)
      await assert.rejects(act(employer,{...request,terms:{...terms,role:'Different'}}),/different change/)
      await assert.rejects(load(talent,agreement),/not found/)
      await assert.rejects(load(outsider,agreement),/not found/)
      assert.equal((await get(talent,new URLSearchParams())).threads.length,0)
      assert.equal((await db.pool.query('SELECT COUNT(*)::int AS n FROM notifications')).rows[0].n,0)
    })
    await t.test('invitation accepts an exact version and revisions require renewed acceptance',async()=>{
      const send=command('employment_send',{agreement_id:agreement,expected_version:1})
      await act(employer,send);await act(employer,send)
      assert.equal((await db.pool.query('SELECT COUNT(*)::int AS n FROM notifications')).rows[0].n,1)
      await assert.rejects(act(employer,command('employment_accept',{agreement_id:agreement,expected_version:1,publish_status:true})),/named talent/)
      await act(employer,command('employment_revise',{agreement_id:agreement,expected_version:1,terms:{...terms,notice_days:21}}))
      await assert.rejects(load(talent,agreement),/not found/)
      await act(employer,command('employment_send',{agreement_id:agreement,expected_version:2}))
      await assert.rejects(act(talent,command('employment_accept',{agreement_id:agreement,expected_version:1,publish_status:true})),/changed/)
      await act(talent,command('employment_accept',{agreement_id:agreement,expected_version:2,publish_status:true}))
      const current=(await load(talent,agreement)).agreement
      assert.equal(current.status,'active');assert.equal(current.accepted_version,2)
      await assert.rejects(act(employer,command('employment_revise',{agreement_id:agreement,expected_version:2,terms})),/cannot be edited/)
      assert.equal((await summary(talent)).employed,true)
    })
    await t.test('messages, replies and bounded reads are participant scoped',async()=>{
      const msg=command('employment_message',{agreement_id:agreement,text:'Can we discuss the start time?'})
      await act(employer,msg);await act(employer,msg)
      const original=(await load(talent,agreement)).messages.find(m=>m.kind==='message')
      await assert.rejects(act(outsider,command('employment_message',{agreement_id:agreement,text:'Intrusion'})),/not found/)
      await act(talent,command('employment_message',{agreement_id:agreement,text:'Yes, 9am.',reply_to_id:original.id}))
      const data=await load(employer,agreement)
      assert.equal(data.messages.filter(m=>m.body===msg.text).length,1)
      assert.equal(data.messages.find(m=>m.body==='Yes, 9am.').reply_body,msg.text)
      await act(talent,{action:'employment_read',agreement_id:agreement,through_id:original.id})
      assert.ok((await load(employer,agreement)).messages.find(m=>m.id===original.id).read_at)
      await assert.rejects(act(talent,{action:'employment_read',agreement_id:agreement,through_id:randomUUID()}),/does not belong/)
    })
    await t.test('one period per month, retries do not duplicate and only talent confirms',async()=>{
      await assert.rejects(act(talent,command('employment_report',{agreement_id:agreement,month,paid_on:today,method:'cash'})),/employer/)
      const future=new Date(today);future.setUTCMonth(future.getUTCMonth()+1,1)
      await assert.rejects(act(employer,command('employment_report',{agreement_id:agreement,month:future.toISOString().slice(0,7),paid_on:today,method:'bank_transfer'})),/month/)
      const report=command('employment_report',{agreement_id:agreement,month,paid_on:today,method:'bank_transfer'})
      firstPeriod=(await act(employer,report)).period_id
      assert.equal((await act(employer,report)).period_id,firstPeriod)
      assert.equal((await load(talent,agreement)).periods.length,1)
      assert.equal((await load(talent,agreement)).periods[0].status,'reported')
      await assert.rejects(act(employer,command('employment_report',{agreement_id:agreement,month,paid_on:today,method:'cash'})),/already reported/)
      await assert.rejects(act(employer,command('employment_confirm',{agreement_id:agreement,period_id:firstPeriod,expected_revision:1,received_on:today})),/named talent/)
      await assert.rejects(act(outsider,command('employment_confirm',{agreement_id:agreement,period_id:firstPeriod,expected_revision:1,received_on:today})),/not found/)
    })
    await t.test('non-receipt, correction and stale confirmation preserve audit history',async()=>{
      await act(talent,command('employment_dispute',{agreement_id:agreement,period_id:firstPeriod,expected_revision:1,note:'Only half arrived.'}))
      assert.equal((await load(talent,agreement)).periods[0].status,'disputed')
      await assert.rejects(act(employer,command('employment_report',{agreement_id:agreement,month,paid_on:today,method:'cash',expected_revision:1})),/changed/)
      await act(employer,command('employment_report',{agreement_id:agreement,month,paid_on:today,method:'cash',expected_revision:2,note:'Balance paid in cash.'}))
      await assert.rejects(act(talent,command('employment_confirm',{agreement_id:agreement,period_id:firstPeriod,expected_revision:1,received_on:today})),/changed/)
      const confirm=command('employment_confirm',{agreement_id:agreement,period_id:firstPeriod,expected_revision:3,received_on:today})
      await act(talent,confirm);await act(talent,confirm)
      const data=await load(talent,agreement)
      assert.equal(data.periods[0].status,'confirmed')
      assert.equal(data.events.filter(e=>e.action==='employment_confirm').length,1)
      assert.equal(data.events.find(e=>e.action==='employment_dispute').metadata.note,'Only half arrived.')
      assert.equal((await summary(talent)).confirmed_months,1)
    })
    await t.test('ended contracts allow outstanding receipt but reject months outside employment',async()=>{
      const record=await act(employer,command('employment_report',{agreement_id:agreement,month:oldMonth,paid_on:today,method:'cash'}))
      await act(talent,command('employment_end',{agreement_id:agreement,expected_version:2,note:'Notice completed.'}))
      assert.equal((await summary(talent)).employed,false)
      await act(talent,command('employment_confirm',{agreement_id:agreement,period_id:record.period_id,expected_revision:1,received_on:today}))
      assert.equal((await summary(talent)).confirmed_months,2)
      await act(talent,command('employment_visibility',{agreement_id:agreement,publish_status:false}))
      assert.equal((await summary(talent)).confirmed_months,0)
      assert.equal((await db.pool.query('SELECT COUNT(*)::int AS n FROM wallet_transactions')).rows[0].n,0)
    })
    await t.test('unsent withdrawal stays private and blocking prevents fresh invitations',async()=>{
      second=(await act(employer,command('employment_create',{talent_id:outsider,terms}))).agreement_id
      await act(employer,command('employment_withdraw',{agreement_id:second,expected_version:1}))
      await assert.rejects(load(outsider,second),/not found/)
      await db.pool.query("INSERT INTO community_threads(initiator_id,recipient_id,status) VALUES($1,$2,'blocked')",[employer,outsider])
      await assert.rejects(act(employer,command('employment_create',{talent_id:outsider,terms})),/blocked/)
    })
    await t.test('escrow method requires a real paid deal and cannot reuse one payment',async()=>{
      second=(await act(employer,command('employment_create',{talent_id:talent,terms}))).agreement_id
      await act(employer,command('employment_send',{agreement_id:second,expected_version:1}))
      await act(talent,command('employment_accept',{agreement_id:second,expected_version:1,publish_status:false}))
      await assert.rejects(act(talent,command('employment_message',{agreement_id:second,text:'Wrong reply',reply_to_id:(await load(talent,agreement)).messages[0].id})),/Reply/)
      const escrow=randomUUID()
      await db.pool.query("INSERT INTO escrows(id,client_id,talent_id,amount,status,work_status,released_at) VALUES($1,$2,$3,200000,'released','completed',NOW())",[escrow,employer,talent])
      await assert.rejects(act(employer,command('employment_report',{agreement_id:second,month,paid_on:today,method:'escrow',escrow_id:randomUUID()})),/completed escrow/)
      await act(employer,command('employment_report',{agreement_id:second,month,paid_on:today,method:'escrow',escrow_id:escrow}))
      await assert.rejects(act(employer,command('employment_report',{agreement_id:second,month:oldMonth,paid_on:today,method:'escrow',escrow_id:escrow})),/already linked/)
    })
    await t.test('public profile and notification payloads never expose private terms',async()=>{
      const {default:handler}=await import('../api/users/[username].js')
      let body;const res={setHeader(){},end(value){body=JSON.parse(value)}}
      await handler({method:'GET',query:{username:'talent'}},res)
      assert.equal(res.statusCode,200)
      assert.equal(JSON.stringify(body).includes('200000'),false)
      assert.equal(JSON.stringify(body).includes('Design and sew'),false)
      const notifications=(await db.pool.query('SELECT title,body,metadata FROM notifications')).rows
      assert.equal(JSON.stringify(notifications).includes('200000'),false)
      assert.equal(JSON.stringify(notifications).includes('Only half'),false)
    })
    await t.test('API rejects anonymous and outsider access',async()=>{
      process.env.JWT_SECRET||='employment-test-secret'
      const {signSession}=await import('../api/_lib/auth.js'),{default:handler}=await import('../api/escrows/index.js')
      const res={setHeader(){},end(){}}
      await handler({method:'GET',url:'/api/escrows?employment_id='+agreement,headers:{host:'localhost'}},res)
      assert.equal(res.statusCode,401)
      await handler({method:'GET',url:'/api/escrows?employment_id='+agreement,headers:{host:'localhost',cookie:'cw_session='+signSession({sub:outsider})}},res)
      assert.equal(res.statusCode,404)
      const req=Readable.from([Buffer.from(JSON.stringify(command('employment_confirm',{agreement_id:second,period_id:firstPeriod,expected_revision:1,received_on:today})))])
      Object.assign(req,{method:'POST',url:'/api/escrows',headers:{host:'localhost',cookie:'cw_session='+signSession({sub:talent})}})
      await handler(req,res);assert.equal(res.statusCode,404)
    })
  }finally{delete global.__tworldPool;await db.close()}
})
