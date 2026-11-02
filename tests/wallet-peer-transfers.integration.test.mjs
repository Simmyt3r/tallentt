import test,{before,after} from 'node:test'
import assert from 'node:assert/strict'
import {readFileSync} from 'node:fs'
import {randomUUID} from 'node:crypto'
import pg from 'pg'

if(!process.env.DATABASE_URL)throw new Error('This test requires a disposable PostgreSQL DATABASE_URL.')
// pg Pool must exist before importing wallet modules. The app's production
// db adapter intentionally uses a shared pool for serverless instances.
const pool=new pg.Pool({connectionString:process.env.DATABASE_URL,max:10,ssl:false})
global.__tworldPool=pool
const {transferWalletBalance,findWalletRecipient}=await import('../api/_lib/walletPeerTransfers.js')
const alice=randomUUID(),bob=randomUUID(),charlie=randomUUID()
async function balance(id){
 const {rows}=await pool.query('SELECT balance FROM wallets WHERE user_id=$1',[id])
 return Number(rows[0]?.balance||0)
}
async function records(){
 const {rows}=await pool.query('SELECT id,sender_id,recipient_id,client_token,amount FROM wallet_transfer_requests')
 return rows
}
before(async()=>{
 await pool.query(`CREATE TABLE users(id UUID PRIMARY KEY,username TEXT UNIQUE NOT NULL,full_name TEXT NOT NULL,
   role TEXT NOT NULL DEFAULT 'dual',avatar_url TEXT,company_suffix TEXT);
 CREATE TABLE wallets(user_id UUID PRIMARY KEY REFERENCES users(id),balance INT NOT NULL DEFAULT 0 CHECK(balance>=0),
   updated_at TIMESTAMPTZ DEFAULT NOW());
 CREATE TABLE wallet_transactions(id UUID PRIMARY KEY DEFAULT gen_random_uuid(),user_id UUID NOT NULL REFERENCES users(id),
   type TEXT NOT NULL,amount INT NOT NULL CHECK(amount>0),balance_after INT NOT NULL CHECK(balance_after>=0),
   status TEXT NOT NULL DEFAULT 'success',reference TEXT UNIQUE,escrow_id UUID,room_id UUID,
   created_at TIMESTAMPTZ DEFAULT NOW());
 CREATE TABLE notifications(id UUID PRIMARY KEY DEFAULT gen_random_uuid(),user_id UUID NOT NULL REFERENCES users(id),
   type TEXT NOT NULL,title TEXT NOT NULL,body TEXT,link_url TEXT,metadata JSONB DEFAULT '{}'::jsonb,
   read_at TIMESTAMPTZ,created_at TIMESTAMPTZ DEFAULT NOW());`)
 const sql=readFileSync(new URL('../db/patch-wallet-peer-transfers-2026-11.sql',import.meta.url),'utf8')
 await pool.query(sql)
 await pool.query('INSERT INTO users(id,username,full_name) VALUES($1,$2,$3),($4,$5,$6),($7,$8,$9)',
  [alice,'Alice_A','Alice A',bob,'Bob_B','Bob B',charlie,'Charlie_C','Charlie C'])
 await pool.query('INSERT INTO wallets(user_id,balance) VALUES($1,10000),($2,2000),($3,0)',[alice,bob,charlie])
})
after(async()=>{await pool.end();delete global.__tworldPool})
test('exact account lookup; never allow self, unknown or ambiguous identities',async()=>{
 assert.equal((await findWalletRecipient(alice,'@Bob_B')).id,bob)
 await assert.rejects(findWalletRecipient(alice,'Alice_A'),{status:400})
 await assert.rejects(findWalletRecipient(alice,'not_a_registered_account'),{status:404})
 await pool.query('INSERT INTO users(id,username,full_name) VALUES($1,$2,$3)',[randomUUID(),'bOB_B','Caps Variant'])
 await assert.rejects(findWalletRecipient(alice,'bob_b'),{status:409})
 assert.equal((await findWalletRecipient(alice,'Bob_B')).id,bob)
})
test('single transfer posts two balanced, linked and labeled ledger rows',async()=>{
 const token=randomUUID()
 const result=await transferWalletBalance(alice,{recipient_username:'Bob_B',amount:'1800',client_token:token})
 assert.equal(result.alreadyProcessed,false)
 assert.equal(result.balance,8200)
 assert.equal(await balance(bob),3800)
 const {rows}=await pool.query('SELECT user_id,type,amount,balance_after,transfer_id FROM wallet_transactions WHERE transfer_id=$1 ORDER BY type',[result.transferId])
 assert.equal(rows.length,2)
 assert.deepEqual(rows.map(r=>r.type),['wallet_transfer_received','wallet_transfer_sent'])
 assert.equal(rows.find(r=>r.user_id===alice).balance_after,8200)
 assert.equal(rows.find(r=>r.user_id===bob).balance_after,3800)
 const retry=await transferWalletBalance(alice,{recipient_username:'Bob_B',amount:1800,client_token:token})
 assert.equal(retry.alreadyProcessed,true)
 assert.equal(retry.transferId,result.transferId)
 assert.equal(await balance(alice),8200)
 assert.equal(await balance(bob),3800)
 await assert.rejects(transferWalletBalance(alice,{recipient_username:'Bob_B',amount:1700,client_token:token}),{status:409})
})
test('insufficient funds never produce debit, credit or idempotency row',async()=>{
 const previous=await records()
 const initialAlice=await balance(alice),initialBob=await balance(bob)
 await assert.rejects(transferWalletBalance(alice,{recipient_username:'Bob_B',amount:'99999',client_token:randomUUID()}),{status:402})
 assert.equal((await records()).length,previous.length)
 assert.equal(await balance(alice),initialAlice)
 assert.equal(await balance(bob),initialBob)
})
test('concurrent same-token retry cannot double spend',async()=>{
 const token=randomUUID()
 const [a,b]=await Promise.all([
   transferWalletBalance(alice,{recipient_username:'Bob_B',amount:700,client_token:token}),
   transferWalletBalance(alice,{recipient_username:'Bob_B',amount:700,client_token:token}),
 ])
 assert.equal([a,b].filter(x=>!x.alreadyProcessed).length,1)
 assert.equal(a.transferId,b.transferId)
 const {rows}=await pool.query('SELECT COUNT(*)::int AS count FROM wallet_transactions WHERE transfer_id=$1',[a.transferId])
 assert.equal(rows[0].count,2)
 assert.equal(await balance(alice),7500)
 assert.equal(await balance(bob),4500)
})
test('opposing concurrent transfers lock wallets in the same order and conserve value',async()=>{
 const amounts=[balance(alice),balance(bob),balance(charlie)]
 const [a,b]=await Promise.all([
   transferWalletBalance(alice,{recipient_username:'Bob_B',amount:150,client_token:randomUUID()}),
   transferWalletBalance(bob,{recipient_username:'Alice_A',amount:120,client_token:randomUUID()}),
 ])
 assert.ok(a.transferId&&b.transferId)
 const afterBalances=await Promise.all([balance(alice),balance(bob),balance(charlie)])
 const old=await Promise.all(amounts)
 assert.equal(afterBalances.reduce((x,y)=>x+y,0),old.reduce((x,y)=>x+y,0))
})
test('refuse forged, invalid and fractional transfer amounts before transaction begins',async()=>{
 for(const amount of [0,-1,1.5,'1.5','1e3','NaN',9999999999]){
   await assert.rejects(transferWalletBalance(alice,{recipient_username:'Bob_B',amount,client_token:randomUUID()}),{status:400})
 }
 await assert.rejects(transferWalletBalance(alice,{recipient_username:'Bob_B',amount:1,client_token:'bad-token'}),{status:400})
})
