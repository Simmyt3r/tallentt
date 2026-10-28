import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
const read=p=>readFileSync(new URL('../'+p,import.meta.url),'utf8')
test('Admin panel, secret storage and public verifier are wired to signing actions',()=>{
  const admin=read('src/pages/Admin.jsx')
  const panel=read('src/components/AdminWorkPassSigning.jsx')
  const backend=read('api/_lib/workPassSigning.js')
  const verify=read('src/lib/workPassVerify.js')
  assert.match(admin,/\{ id: 'work-pass', label: 'Work Pass Security'/)
  assert.match(panel,/api\.activateAdminWorkPassSigning\(\)/)
  assert.match(backend,/generateKeyPairSync\('ec'/)
  assert.match(backend,/createCipheriv\('aes-256-gcm'/)
  assert.match(backend,/hkdfSync\('sha256'/)
  assert.match(backend,/applyAdminMigration\(adminId/)
  assert.match(backend,/createDecipheriv\('aes-256-gcm'/)
  assert.match(backend,/admin_audit_logs/)
  assert.match(verify,/publicKey\?\.keys/)
  assert.doesNotMatch(panel,/encrypted_private|privatePem|PRIVATE KEY/)
})
