import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
// Pure scoring tests don't open a DB connection; the module's SQL imports
// still expect an environment variable when the Node module is initialized.
process.env.DATABASE_URL ||= 'postgres://unused:unused@localhost:5432/unused'
const { selectGoldTop12 } = await import('../api/_lib/workPassTop12.js')
const { ORBIT_DEFAULTS } = await import('../api/_lib/accountOrbit.js')
const read=p=>readFileSync(new URL('../'+p,import.meta.url),'utf8')
const owner=(n,completed=10)=>({
  id:'person-'+n,username:'talent'+n,avatar_url:'portrait.jpg',bio:'Worker',
  skills:['Sewing'],location:'Lagos',country:'Nigeria',created_at:'2020-01-01',
  verified_hats:1,completed_jobs:completed,successful_hires:4,
})
test('Top 12 rejects lower-tier passes and caps at twelve unique owners',()=>{
  const owners=Array.from({length:16},(_,i)=>owner(i,i===0?9:10))
  const activity=new Map(owners.map(o=>[o.id,new Set(Array.from({length:10},(_,i)=>'2026-10-'+i))]))
  const result=selectGoldTop12(owners,ORBIT_DEFAULTS,activity)
  assert.equal(result.length,12)
  assert.equal(result.some(p=>p.id==='person-0'),false)
  assert.equal(result.every(p=>p.tier==='Gold'||p.tier==='Diamond'),true)
})
test('insufficient Orbit Score blocks Gold even with many jobs',()=>{
  const low=owner(1,100)
  low.avatar_url='';low.bio='';low.skills=[];low.location='';low.country=''
  low.verified_hats=0;low.successful_hires=0;low.created_at=new Date().toISOString()
  assert.deepEqual(selectGoldTop12([low],ORBIT_DEFAULTS),[])
})
test('Top 12 is enforced by API rather than client-side decoration',()=>{
  const api=read('api/showroom/index.js'),ui=read('src/components/Showroom.jsx')
  assert.match(api,/getGoldTop12\(session\?\.sub\)/)
  assert.match(ui,/\['top12', '🏆 Top 12 · Gold\+'\]/)
  assert.match(read('api/_lib/workPassTop12.js'),/status='released'/)
})
