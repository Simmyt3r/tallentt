import test,{before,after} from 'node:test'
import assert from 'node:assert/strict'
import {randomUUID} from 'node:crypto'
import {readFile} from 'node:fs/promises'
import {Readable} from 'node:stream'
import {testDatabase} from './database.mjs'

let db,pool,handler
before(async()=>{
  process.env.JWT_SECRET='stabilization-regression-secret'
  db=await testDatabase()
  pool=db.pool
  global.__tworldPool=pool
  await pool.query(await readFile(new URL('../db/schema.sql',import.meta.url),'utf8'))
  handler=(await import('../api/auth/index.js')).default
})
after(async()=>{await db?.close();delete global.__tworldPool})
async function register(body){
  const req=Readable.from([Buffer.from(JSON.stringify({action:'register',...body}))])
  Object.assign(req,{method:'POST',url:'/api/auth',headers:{host:'localhost'}})
  const res={statusCode:200,headers:{},setHeader(k,v){this.headers[k]=v},
    end(raw){this.body=JSON.parse(raw)}}
  await handler(req,res)
  return res
}
const payload=role=>({
  fullName:role==='talent'?'Talent Example':'Client Example',
  username:'stabilize_'+role+'_'+randomUUID().slice(0,7),
  email:role+'_'+randomUUID()+'@example.test',
  password:'correct-horse-battery-2026',
  country:'Nigeria',role,
})
test('registers explicit Talent without inventing a geographic LGA',async()=>{
  const body=payload('talent'),res=await register(body)
  assert.equal(res.statusCode,201,JSON.stringify(res.body))
  assert.equal(res.body.user.role,'talent')
  const {rows}=await pool.query('SELECT role,country,lga FROM users WHERE username=$1',[body.username])
  assert.deepEqual(rows,[{role:'talent',country:'Nigeria',lga:null}])
})
test('registers Client separately without treating industry/category as location',async()=>{
  const body=payload('client'),res=await register(body)
  assert.equal(res.statusCode,201,JSON.stringify(res.body))
  const {rows}=await pool.query('SELECT role,lga FROM users WHERE username=$1',[body.username])
  assert.deepEqual(rows,[{role:'client',lga:null}])
})
test('rejects unapproved role values; preserves explicit verified locality',async()=>{
  const invalid=await register({...payload('client'),role:'admin'})
  assert.equal(invalid.statusCode,400)
  const body={...payload('talent'),lga:'Gwagwalada'}
  const res=await register(body)
  assert.equal(res.statusCode,201,JSON.stringify(res.body))
  const {rows}=await pool.query('SELECT role,lga FROM users WHERE username=$1',[body.username])
  assert.deepEqual(rows,[{role:'talent',lga:'Gwagwalada'}])
})
