import test from 'node:test'
import assert from 'node:assert/strict'
import {readdir,readFile} from 'node:fs/promises'
import {resolve,relative} from 'node:path'
import {fileURLToPath} from 'node:url'
import {publicTalentCard} from '../shared/talentCard.js'

const root=fileURLToPath(new URL('../src/',import.meta.url))
async function allSources(folder){
  const items=await readdir(folder,{withFileTypes:true})
  const found=[]
  for(const item of items){
    const path=resolve(folder,item.name)
    if(item.isDirectory())found.push(...await allSources(path))
    else if(/\.[cm]?[jt]sx?$/.test(item.name))found.push(path)
  }
  return found
}
test('browser bundles never import serverless /api/ modules directly',async()=>{
  const invalid=[]
  for(const file of await allSources(root)){
    const code=await readFile(file,'utf8')
    if(/(?:from\s*|import\s*\(\s*)['"][^'"]*(?:\.\.\/)+api\/|(?:from\s*|import\s*\(\s*)['"]\/api\//.test(code))
      invalid.push(relative(root,file))
  }
  assert.deepEqual(invalid,[],
    'API/server modules cannot be imported by frontend code: browser may receive JSON instead of JS')
})
test('the shared talent card exposes only its public salary projection',()=>{
  const card=publicTalentCard({mainTalent:'Fashion',workModes:['Gigs'],
    salary:{visibility:'private',min:250000,max:500000,tier:'Senior'},
    internalNotes:'private'})
  assert.deepEqual(card.salary,{visibility:'private'})
  assert.equal('internalNotes' in card,false)
})
