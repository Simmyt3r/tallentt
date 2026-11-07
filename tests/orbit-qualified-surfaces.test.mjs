import test from 'node:test'
import assert from 'node:assert/strict'
import {readFile} from 'node:fs/promises'

const source=async path=>readFile(new URL('../'+path,import.meta.url),'utf8')

// Lightweight surface regression: these assertions prevent the three public
// signed-in Hat detail paths from silently losing the verified mechanism.
// All point awards and anti-fraud rules are exercised in the DB tests.
test('Bento, direct Hat and Talent profile use one authenticated qualified Discovery lifecycle',async()=>{
  const bento=await source('src/components/BentoCardDetailModal.jsx')
  const profile=await source('src/pages/TalentProfile.jsx')
  const hat=await source('src/pages/HatPage.jsx')
  const hook=await source('src/lib/useQualifiedDiscovery.js')
  assert.match(bento,/useQualifiedDiscovery\(/)
  assert.match(profile,/useQualifiedDiscovery\(/)
  assert.match(hat,/BentoCardDetailModal/)
  for(const page of [bento,profile]){
    assert.match(page,/markEngagement\(/)
    assert.match(page,/recordEvidence\('share'/)
    assert.match(page,/recordEvidence\('second_media'/)
    assert.match(page,/api\.saveHat\(/)
    assert.match(page,/api\.getSavedHatStatus\(/)
  }
  assert.match(hook,/viewerId!==ownerId&&role==='talent'/)
  assert.match(hook,/discovery_open/)
  assert.match(hook,/discovery_heartbeat/)
  assert.match(hook,/visible:true/)
  assert.match(hook,/document\.hidden/)
  assert.match(hook,/discovery_complete/)
})

test('Seal picker reads server-filtered sources and does not remove manual-ID fallback',async()=>{
  const backend=await source('api/_lib/milestoneSeals.js')
  const ui=await source('src/pages/MilestoneCenter.jsx')
  assert.match(backend,/eligibleSealSources\(/)
  assert.match(backend,/\(e\.client_id=\$1 OR e\.talent_id=\$1\)/)
  assert.match(backend,/\(a\.employer_id=\$1 OR a\.talent_id=\$1\)/)
  assert.match(backend,/\(w\.sender_id=\$1 OR w\.recipient_id=\$1\)/)
  assert.match(backend,/AND NOT EXISTS|AND not exists/i)
  assert.match(ui,/Eligible verified transaction/)
  assert.match(ui,/Manual verified source ID/)
  assert.match(ui,/disabled=\{!!busy\|\|!sourceToSubmit\}/)
})
