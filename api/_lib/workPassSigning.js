// Server-managed Work Pass signing. No private key is sent to the browser,
// logged, checked into source or stored unencrypted. The pre-existing
// JWT_SECRET acts as a stable server-side envelope key via HKDF + AES-256-GCM.
// Rotating JWT_SECRET requires an explicit key migration/backup procedure.
import {
  createPrivateKey, createPublicKey, generateKeyPairSync, randomBytes,
  createCipheriv, createDecipheriv, hkdfSync,
  sign as cryptoSign, verify as cryptoVerify,
} from 'node:crypto'
import { query, getClient } from './db.js'
import { adminMigrationStatus, applyAdminMigration } from './adminMigrations.js'

const fail=(status,message)=>Object.assign(new Error(message),{status})
const ENV_KEY_ID=()=>process.env.WORK_PASS_SIGNING_KEY_ID||'workpass-v1'
const KDF_CONTEXT='chombutar-work-pass-encryption-v1'
const now=()=>Math.floor(Date.now()/1000)
function envelopeKey(salt) {
  const secret=process.env.JWT_SECRET
  if(!secret || Buffer.byteLength(secret,'utf8')<32)
    throw fail(503,'Server authentication secret is missing or too short to protect signing keys. Ask the deployment owner to check JWT_SECRET.')
  return Buffer.from(hkdfSync('sha256',Buffer.from(secret,'utf8'),salt,KDF_CONTEXT,32))
}
function encryptPrivate(pem,keyId) {
  const salt=randomBytes(32),iv=randomBytes(12)
  const cipher=createCipheriv('aes-256-gcm',envelopeKey(salt),iv)
  cipher.setAAD(Buffer.from(keyId,'utf8'))
  const encrypted=Buffer.concat([cipher.update(pem,'utf8'),cipher.final()])
  return {encrypted,salt,iv,tag:cipher.getAuthTag()}
}
function decryptPrivate(row) {
  try {
    const decrypt=createDecipheriv('aes-256-gcm',envelopeKey(row.salt),row.iv)
    decrypt.setAAD(Buffer.from(row.key_id,'utf8'))
    decrypt.setAuthTag(row.auth_tag)
    return createPrivateKey(Buffer.concat([decrypt.update(row.encrypted_private),decrypt.final()]))
  } catch(error) {
    if(error.status)throw error
    throw fail(503,'Stored Work Pass key cannot be opened. Do not rotate the server authentication secret without first migrating encrypted keys.')
  }
}
function legacyKey(){
  const pem=process.env.WORK_PASS_SIGNING_PRIVATE_KEY?.replace(/\\n/g,'\n')
  if(!pem)return null
  try {
    const key=createPrivateKey(pem)
    if(key.asymmetricKeyType!=='ec' || key.asymmetricKeyDetails?.namedCurve!=='prime256v1')
      throw Error('Invalid curve')
    return {keyId:ENV_KEY_ID(),privateKey:key,publicJwk:createPublicKey(key).export({format:'jwk'}),source:'environment'}
  } catch {throw fail(503,'Previously configured Work Pass signing key is invalid.')}
}
async function storedKeys(){
  const {rows:meta}=await query("SELECT to_regclass('work_pass_signing_keys') AS table_name")
  if(!meta[0]?.table_name)return []
  const {rows}=await query(`SELECT key_id,encrypted_private,salt,iv,auth_tag,public_jwk,
    active,created_at,retired_at,created_by
    FROM work_pass_signing_keys
    WHERE active=TRUE OR retired_at > NOW()-INTERVAL '8 days'
    ORDER BY active DESC,created_at DESC LIMIT 30`)
  return rows
}
async function identity(){
  const rows=await storedKeys()
  const active=rows.find(row=>row.active)
  if(active)return {
    keyId:active.key_id,privateKey:decryptPrivate(active),
    publicJwk:active.public_jwk,source:'admin',createdAt:active.created_at,rows,
  }
  const env=legacyKey()
  return env?{...env,rows}:null
}
export async function signingPublicKey(){
  const rows=await storedKeys()
  const active=rows.find(row=>row.active)
  const legacy=legacyKey()
  const keys=rows.map(r=>({keyId:r.key_id,jwk:r.public_jwk}))
  if(legacy&&!keys.some(k=>k.keyId===legacy.keyId))
    keys.push({keyId:legacy.keyId,jwk:legacy.publicJwk})
  const chosen=active?{keyId:active.key_id,jwk:active.public_jwk,source:'admin'}
    :legacy?{keyId:legacy.keyId,jwk:legacy.publicJwk,source:'environment'}:null
  return {configured:!!chosen,keyId:chosen?.keyId||null,jwk:chosen?.jwk||null,
    keys,source:chosen?.source||null}
}
export async function signWorkPassClaim(claim){
  const signing=await identity()
  if(!signing)return {token:null,keyId:null}
  const body=Buffer.from(JSON.stringify(claim)).toString('base64url')
  const prefix='CTWP1.'+signing.keyId+'.'+body
  const signature=cryptoSign('sha256',Buffer.from(prefix),{
    key:signing.privateKey,dsaEncoding:'ieee-p1363',
  }).toString('base64url')
  return {token:prefix+'.'+signature,keyId:signing.keyId}
}
export async function adminSigningStatus(){
  const publicKeys=await signingPublicKey()
  const signing=await identity() // Confirm the encrypted key is still decryptable.
  const rows=await storedKeys()
  return {
    enabled:!!signing,source:signing?.source||null,
    keyId:signing?.keyId||null,createdAt:signing?.createdAt||null,
    historicalKeys:rows.filter(r=>!r.active).length,
    publicKeyReady:publicKeys.configured,
    requiresSetup:!rows.some(r=>r.active),
    secretStorage:'AES-256-GCM / HKDF',
  }
}
async function ensureKeyTable(adminId){
  const catalog=await adminMigrationStatus()
  const current=catalog.migrations.find(r=>r.id==='work-pass-signing-2026-10')
  if(!current)throw fail(503,'Work Pass signing migration is not bundled in this deployment.')
  if(current.status==='changed')throw fail(409,'Work Pass signing migration changed. Resolve it in Database Migrations.')
  if(current.status==='pending'){
    await applyAdminMigration(adminId,{
      migrationId:current.id,checksum:current.checksum,confirm:'APPLY '+current.id,
    })
  }
}
export async function adminActivateSigning(adminId,{rotate=false,confirmation}={}){
  if(rotate&&confirmation!=='ROTATE WORK PASS KEY')
    throw fail(400,'Confirm key rotation before continuing.')
  await ensureKeyTable(adminId)
  // Generate the secret on the server. No browser-supplied key material.
  const pair=generateKeyPairSync('ec',{namedCurve:'prime256v1'})
  const privatePem=pair.privateKey.export({format:'pem',type:'pkcs8'})
  const publicJwk=pair.publicKey.export({format:'jwk'})
  const keyId='wp-'+randomBytes(10).toString('hex')
  const sealed=encryptPrivate(privatePem,keyId)
  // Confirm the freshly generated and encrypted key is usable before commit.
  const unsealed=decryptPrivate({
    encrypted_private:sealed.encrypted,salt:sealed.salt,
    iv:sealed.iv,auth_tag:sealed.tag,key_id:keyId,
  })
  const challenge=Buffer.from('chombutar-key-provisioning')
  const proof=cryptoSign('sha256',challenge,unsealed)
  if(!cryptoVerify('sha256',challenge,pair.publicKey,proof))
    throw fail(503,'Work Pass signing key self-check failed.')
  const client=await getClient()
  let begun=false
  try{
    await client.query('BEGIN');begun=true
    await client.query("SET LOCAL lock_timeout = '2500ms'")
    await client.query("SET LOCAL statement_timeout = '15000ms'")
    const {rows:lock}=await client.query('SELECT pg_try_advisory_xact_lock(154715, 202611) AS ok')
    if(!lock[0]?.ok)throw fail(409,'Another Work Pass key operation is in progress.')
    const {rows:existing}=await client.query(
      'SELECT key_id FROM work_pass_signing_keys WHERE active=TRUE FOR UPDATE')
    if(existing.length&&!rotate)
      throw fail(409,'Work Pass signing is already active. Refresh the status.')
    if(!existing.length&&rotate)
      throw fail(409,'No Admin-managed key exists to rotate. Activate signing first.')
    if(rotate)await client.query(`UPDATE work_pass_signing_keys
      SET active=FALSE,retired_at=NOW() WHERE active=TRUE`)
    await client.query(`INSERT INTO work_pass_signing_keys
      (key_id,encrypted_private,salt,iv,auth_tag,public_jwk,created_by)
      VALUES ($1,$2,$3,$4,$5,$6::jsonb,$7)`,[
        keyId,sealed.encrypted,sealed.salt,sealed.iv,sealed.tag,
        JSON.stringify(publicJwk),adminId,
      ])
    await client.query(`INSERT INTO admin_audit_logs
      (admin_id,action,target_type,metadata)
      VALUES($1,$2,'work_pass_signing',$3::jsonb)`,[
        adminId,rotate?'rotate_work_pass_signing':'activate_work_pass_signing',
        JSON.stringify({keyId,previousKeyId:existing[0]?.key_id||null}),
      ])
    await client.query('COMMIT');begun=false
    return {enabled:true,keyId,rotated:rotate,source:'admin'}
  }catch(error){
    if(begun)await client.query('ROLLBACK').catch(()=>{})
    throw error
  }finally{client.release()}
}
