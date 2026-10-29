import test from 'node:test'
import assert from 'node:assert/strict'
import {randomUUID} from 'node:crypto'
import {readFile} from 'node:fs/promises'
import {Readable} from 'node:stream'
import {testDatabase} from './database.mjs'
import {normalizeTalentCard, publicTalentCard, validateTalentCardOwnership} from '../api/_lib/talentCard.js'
import {talentGroups, talentPortfolio, resolveTalent} from '../src/lib/talentCard.js'

test('private salary amounts and tier never enter public projections', () => {
  for (const visibility of ['private','tier','range']) {
    const card = normalizeTalentCard({salary:{visibility,tier:'Mid',min:200000,max:300000}})
    const visible = publicTalentCard(card).salary
    assert.equal('min' in visible, visibility === 'range')
    assert.equal('max' in visible, visibility === 'range')
    assert.equal('tier' in visible, visibility === 'tier')
  }
  assert.throws(() => normalizeTalentCard({salary:{visibility:'range',min:400,max:200}}), /range/)
  assert.throws(() => normalizeTalentCard({availability:'employed-verified'}), /availability/)
  assert.throws(() => normalizeTalentCard({workModes:['invented']}), /Gigs/)
})

test('talent deep links filter works and main talent comes first', () => {
  const hats=[{id:'a',category:'Makeup'},{id:'b',category:'Tailoring'},{id:'c',category:'Makeup'}]
  const items=[{id:'1',hat_id:'a'},{id:'2',hat_id:'b'},{id:'3',hat_id:'c'},{id:'4',hat_id:'a'}]
  assert.deepEqual(talentGroups(hats,'Tailoring'),['Tailoring','Makeup'])
  assert.equal(resolveTalent('makeup',talentGroups(hats)),'Makeup')
  assert.equal(resolveTalent('missing',talentGroups(hats)),'')
  assert.deepEqual(talentPortfolio(items,hats,'Makeup').map(i=>i.id),['1','3','4'])
  assert.deepEqual(talentPortfolio(items,hats,'',['4','missing']).map(i=>i.id),['4','1','2'])
})

test('migration, owned selections and public profile privacy work against the database', async () => {
  const db=await testDatabase(); global.__tworldPool=db.pool
  try {
    await db.pool.query(await readFile(new URL('../db/schema.sql',import.meta.url),'utf8'))
    const patch=await readFile(new URL('../db/patch-talent-card-2026-10.sql',import.meta.url),'utf8')
    await db.pool.query(patch); await db.pool.query(patch)
    const owner=randomUUID(),other=randomUUID(),hat=randomUUID(),foreignHat=randomUUID(),media=randomUUID(),foreignMedia=randomUUID()
    for(const [id,name] of [[owner,'talent'],[other,'other']]) await db.pool.query("INSERT INTO users(id,full_name,username,email,password_hash) VALUES($1,$2,$2,$3,'test')",[id,name,name+'@test.local'])
    for(const [id,user] of [[hat,owner],[foreignHat,other]]) await db.pool.query("INSERT INTO hats(id,user_id,username,hat_title,hat_name,category,role) VALUES($1,$2,'talent','Makeup session','Studio','Makeup','talent')",[id,user])
    for(const [id,h] of [[media,hat],[foreignMedia,foreignHat]]) await db.pool.query("INSERT INTO hat_media(id,hat_id,url,public_id,type) VALUES($1,$2,'https://example.test/work.jpg','fixture','image')",[id,h])
    const card=normalizeTalentCard({mainTalent:'Makeup',featuredMedia:[media],workModes:['Full-time'],salary:{visibility:'private',min:200000,max:300000,tier:'Mid'}})
    await validateTalentCardOwnership(db.pool,owner,card)
    await assert.rejects(validateTalentCardOwnership(db.pool,owner,{...card,featuredMedia:[foreignMedia]}),/belong/)
    await assert.rejects(validateTalentCardOwnership(db.pool,owner,{...card,mainTalent:'Tailoring'}),/main talent/)
    process.env.JWT_SECRET ||= 'talent-card-test-secret'
    const {signSession}=await import('../api/_lib/auth.js')
    const {default:authHandler}=await import('../api/auth/index.js')
    async function save(id, payload) {
      const req=Readable.from([Buffer.from(JSON.stringify(payload))])
      Object.assign(req,{method:'PUT',url:'/api/auth',headers:{cookie:'cw_session='+signSession({sub:id})}})
      let body
      const res={setHeader(){},end(v){body=JSON.parse(v)}}
      await authHandler(req,res)
      return {status:res.statusCode,body}
    }
    const saved=await save(owner,{talentCard:card})
    assert.equal(saved.status,200)
    assert.equal(saved.body.user.talentCard.salary.min,200000)
    assert.equal((await save(other,{talentCard:card})).status,400)
    assert.equal((await save(owner,{bio:'Updated biography'})).status,200)
    assert.equal((await db.pool.query('SELECT talent_card FROM users WHERE id=$1',[owner])).rows[0].talent_card.salary.max,300000)
    const {default:handler}=await import('../api/users/[username].js')
    let result
    const res={setHeader(){},end(v){result=JSON.parse(v)}}
    await handler({method:'GET',query:{username:'talent'}},res)
    assert.equal(res.statusCode,200)
    assert.deepEqual(result.user.talentCard.salary,{visibility:'private'})
    assert.equal(result.portfolio[0].id,media)
    assert.equal(JSON.stringify(result).includes('300000'),false)
  } finally {delete global.__tworldPool;await db.close()}
})
