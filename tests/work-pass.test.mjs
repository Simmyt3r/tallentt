import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { workPassTier, WORK_PASS_DISCLAIMER } from '../shared/workPass.js'
const source=p=>readFileSync(new URL('../'+p,import.meta.url),'utf8')
test('tier thresholds do not let likes or views earn trust grades',()=>{
  assert.equal(workPassTier(0,100),'Bronze')
  assert.equal(workPassTier(3,29),'Bronze')
  assert.equal(workPassTier(3,30),'Silver')
  assert.equal(workPassTier(10,65),'Gold')
  assert.equal(workPassTier(30,85),'Diamond')
  assert.match(WORK_PASS_DISCLAIMER,/do not guarantee/)
})
test('proof requires both a completed escrow and authenticated signed media',()=>{
  const backend=source('api/_lib/workPass.js')
  assert.match(backend,/deal.status!=='released'/)
  assert.match(backend,/verifyNewHatMedia/)
  assert.match(backend,/claimHatMediaPermits/)
  assert.match(backend,/client_id=\$2 AND status='pending'/)
  assert.match(backend,/status='approved'/)
  assert.match(backend,/signBytes\('sha256'/)
  assert.match(backend,/manufacturer_verified BOOLEAN|manufacturer_verified/)
})
test('work pass reuses existing auth serverless function rather than adding another one',()=>{
  const auth=source('api/auth/index.js')
  assert.match(auth,/action === 'work_pass'/)
  assert.match(auth,/action === 'work_pass_key'/)
  assert.match(auth,/work_pass_submit_evidence/)
  assert.match(auth,/getSessionUser\(req\)/)
})

test('work pass is accessible from navbar, public profile and each Bento tile',()=>{
  const layout=source('src/components/Layout.jsx')
  const bento=source('src/components/BentoCard.jsx')
  const profile=source('src/components/profile/ProfileView.jsx')
  assert.match(layout,/setWorkPassOpen\(true\)/)
  assert.match(bento,/setPassOpen\(true\)/)
  assert.match(profile,/<WorkPass username=\{profileUser.username\}/)
})
