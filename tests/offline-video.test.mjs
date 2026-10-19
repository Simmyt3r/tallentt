import test from 'node:test'
import assert from 'node:assert/strict'
import {offlineVideoUrl} from '../src/lib/offlineVideo.js'

const valid='https://res.cloudinary.com/chombutar-demo/video/upload/v1234/chombutar_vibes/a/video.mp4'
test('offline URL is restricted to configured Cloudinary video uploads',()=>{
  assert.equal(offlineVideoUrl(valid,'chombutar-demo'),
    valid+'?offline=1')
  assert.throws(()=>offlineVideoUrl(valid,'other-account'),/Only ChombuTar video/)
  assert.throws(()=>offlineVideoUrl('https://example.com/video/upload/x.mp4','chombutar-demo'))
  assert.throws(()=>offlineVideoUrl('http://res.cloudinary.com/chombutar-demo/video/upload/x.mp4','chombutar-demo'))
  assert.throws(()=>offlineVideoUrl('https://res.cloudinary.com/chombutar-demo/image/upload/x.jpg','chombutar-demo'))
  assert.throws(()=>offlineVideoUrl('https://res.cloudinary.com/chombutar-demo/video/upload/x.jpg','chombutar-demo'))
})
test('an offline asset URL is stable and does not add duplicate query markers',()=>{
  const original=valid+'?q=50'
  assert.equal(offlineVideoUrl(original,'chombutar-demo'),valid+'?q=50&offline=1')
  assert.equal(offlineVideoUrl(offlineVideoUrl(original,'chombutar-demo'),'chombutar-demo'),
    valid+'?q=50&offline=1')
})
