import test from 'node:test'
import assert from 'node:assert/strict'
import {readFile,stat} from 'node:fs/promises'

test('every admin allowlisted SQL migration is shipped in the Vercel function bundle',async()=>{
  const root=new URL('../',import.meta.url)
  const config=JSON.parse(await readFile(new URL('vercel.json',root),'utf8'))
  const admin=config.functions?.['api/admin/index.js']
  assert.ok(admin,'Admin function must be configured')
  assert.equal(admin.includeFiles,'db/patch-*.sql',
    'A restrictive SQL glob prevents some admin migrations from running on Vercel')
  const catalog=await readFile(new URL('api/_lib/adminMigrations.js',root),'utf8')
  const paths=[...catalog.matchAll(/\.\.\/\.\.\/db\/(patch-[\w-]+\.sql)/g)].map(v=>v[1])
  assert.ok(paths.length>8,'Regression checker must cover the actual current migration catalog')
  assert.equal(paths.length,new Set(paths).size,'No migrations should be registered twice')
  for(const path of paths){
    const file=new URL('db/'+path,root)
    const info=await stat(file)
    assert.ok(info.isFile()&&info.size>20,'Missing or empty migration: '+path)
  }
  const vibes=config.functions?.['api/vibes/index.js']
  assert.ok(vibes?.maxDuration>=30,'Vibes moderation needs enough time to verify multiple signed uploads')
})
