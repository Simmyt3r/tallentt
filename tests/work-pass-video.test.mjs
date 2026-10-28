import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
const read=p=>readFileSync(new URL('../'+p,import.meta.url),'utf8')
test('Vibes and Showroom share videos through real encoded file, not CSS badge',()=>{
  const module=read('src/lib/workPassVideoShare.js')
  assert.match(module,/paintWorkPassSticker\(ctx/)
  assert.match(module,/canvas\.captureStream\(24\)/)
  assert.match(module,/new MediaRecorder\(canvasStream/)
  assert.match(module,/new File\(\[blob\]/)
  assert.match(module,/navigator\.share\(\{files:\[file\]/)
  assert.match(module,/pass\.signatureStatus!=='signed'/)
  assert.match(read('src/pages/Vibes.jsx'),/shareSignedWorkPassVideo/)
  assert.match(read('src/components/Showroom.jsx'),/shareSignedWorkPassVideo/)
  assert.match(read('src/components/VibesMediaGallery.jsx'),/onShareVideo\(current\)/)
})
