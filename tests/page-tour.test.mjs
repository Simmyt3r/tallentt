import test from 'node:test'
import assert from 'node:assert/strict'
import {
  PAGE_TOURS,
  pageTourKey,
  pageTourForPath,
  readPageTourState,
  shouldShowPageTour,
  acknowledgePageTour,
  stopAllPageTours,
  restartPageTours,
} from '../src/lib/pageTour.js'

function storage(){
  const values=new Map()
  return {
    getItem:key=>values.has(key)?values.get(key):null,
    setItem:(key,value)=>values.set(key,value),
    removeItem:key=>values.delete(key),
    dump:()=>values,
  }
}

test('tour explanations are complete and limited to distinct major screens',()=>{
  assert.equal(PAGE_TOURS.length,16)
  assert.equal(new Set(PAGE_TOURS.map(item=>item.id)).size,PAGE_TOURS.length)
  for(const item of PAGE_TOURS){
    assert.ok(item.title && item.description.length>55 && item.hint)
    assert.ok(item.description.length<245,'Keep the copy short enough for mobile: '+item.id)
  }
  assert.equal(pageTourForPath('/showroom/123')?.id,'showroom')
  assert.equal(pageTourForPath('/bento')?.id,'bento')
  assert.equal(pageTourForPath('/deals/123')?.id,'deals')
  assert.equal(pageTourForPath('/live/stage/123')?.id,'live')
  assert.equal(pageTourForPath('/profile')?.id,'profile')
  assert.equal(pageTourForPath('/profile/somebody-else'),null)
  assert.equal(pageTourForPath('/admin'),null)
  assert.equal(pageTourForPath('/admin',true)?.id,'admin')
  assert.equal(pageTourForPath('/auth'),null)
  assert.equal(pageTourForPath('/hat/123'),null)
  assert.equal(pageTourForPath('/'),null)
})

test('Got it hides only the current screen and persists across sessions',()=>{
  const store=storage(),user='11111111-1111-4111-8111-111111111111'
  const showroom=pageTourForPath('/showroom'),bento=pageTourForPath('/bento')
  assert.ok(shouldShowPageTour(user,showroom,store))
  acknowledgePageTour(user,showroom.id,store)
  assert.equal(shouldShowPageTour(user,showroom,store),false)
  assert.equal(shouldShowPageTour(user,bento,store),true)
  assert.deepEqual(readPageTourState(user,store),{disabled:false,seen:['showroom']})
  assert.equal(JSON.parse(store.getItem(pageTourKey(user))).seen[0],'showroom')
  acknowledgePageTour(user,showroom.id,store)
  assert.equal(readPageTourState(user,store).seen.length,1)
})

test('Dont show me again persists and disables every major screen for only this account',()=>{
  const store=storage(),alice='alice',bob='bob'
  stopAllPageTours(alice,store)
  for(const page of PAGE_TOURS){
    assert.equal(shouldShowPageTour(alice,page,store),false,page.id)
    assert.equal(shouldShowPageTour(bob,page,store),true,page.id)
  }
  assert.equal(readPageTourState(alice,store).disabled,true)
  restartPageTours(alice,store)
  assert.deepEqual(readPageTourState(alice,store),{disabled:false,seen:[]})
  assert.ok(shouldShowPageTour(alice,pageTourForPath('/showroom'),store))
})

test('invalid input and malformed stored data never crash onboarding',()=>{
  const store=storage()
  assert.equal(shouldShowPageTour('',pageTourForPath('/showroom'),store),false)
  assert.equal(shouldShowPageTour('alice',null,store),false)
  store.setItem(pageTourKey('alice'),'{bad json')
  assert.deepEqual(readPageTourState('alice',store),{disabled:false,seen:[]})
  store.setItem(pageTourKey('alice'),JSON.stringify({disabled:'true',seen:['showroom','unknown','showroom',null]}))
  assert.deepEqual(readPageTourState('alice',store),{disabled:false,seen:['showroom']})
})
