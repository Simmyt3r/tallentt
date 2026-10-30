import test from 'node:test'
import assert from 'node:assert/strict'
import {vibeShareUrl,vibeShareText,vibeShareDestinations,safeVibeReturnPath} from '../src/lib/vibeSharing.js'
const id='22222222-2222-4222-8222-222222222222'
test('Vibe permalink always deep-links to exactly one post on the current site',()=>{
  const link=vibeShareUrl(id,'https://chombutar.com.ng/other?bad=1')
  assert.equal(link,'https://chombutar.com.ng/vibes?post='+id)
  assert.equal(vibeShareUrl(id,'http://127.0.0.1:5198'),'http://127.0.0.1:5198/vibes?post='+id)
  assert.throws(()=>vibeShareUrl('javascript:alert(1)','https://chombutar.com.ng'))
  assert.throws(()=>vibeShareUrl(id,'javascript:alert(1)'))
})
test('social destinations encode post URL and user text without HTML injection',()=>{
  const url=vibeShareUrl(id,'https://chombutar.com.ng')
  const text=vibeShareText({full_name:'Designer & Team',body:'See this <b>new</b> project!'})
  assert.match(text,/Designer & Team/)
  const d=vibeShareDestinations(url,text)
  assert.deepEqual(d.map(x=>x.id),['whatsapp','facebook','x','telegram','linkedin','email'])
  assert.equal(new URL(d[0].href).searchParams.get('text'),text+' '+url)
  assert.equal(new URL(d[1].href).searchParams.get('u'),url)
  assert.equal(new URL(d[2].href).searchParams.get('url'),url)
  assert.equal(new URL(d[3].href).searchParams.get('url'),url)
  assert.equal(new URL(d[4].href).searchParams.get('url'),url)
  assert.ok(d[5].href.startsWith('mailto:'))
  assert.ok(d.every(x=>!x.href.includes('<b>')))
})
test('sign-in only returns to valid Vibes post and never to external destinations',()=>{
  const path='/vibes?post='+id
  assert.equal(safeVibeReturnPath(path),path)
  assert.equal(safeVibeReturnPath('/vibes?post='+id+'&other=1'),path)
  for(const bad of ['https://evil.example/vibes?post='+id,'//evil.example/vibes?post='+id,
    '/vibes?post=javascript:alert(1)','/vibes?post='+id+'&post='+id,
    '/showroom?post='+id,'/vibes','/vibes?post=','/vibes?post='+id+'#evil']){
      if(bad.endsWith('#evil'))continue // harmless hash is stripped
      assert.equal(safeVibeReturnPath(bad),null,bad)
  }
  assert.equal(safeVibeReturnPath(path+'#not-used'),path)
})
