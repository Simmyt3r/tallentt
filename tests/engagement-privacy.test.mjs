import test from 'node:test'
import assert from 'node:assert/strict'
import {redactHatEngagement,publicOrbitSummary} from '../api/_lib/engagementPrivacy.js'

test('public and non-owner hat projections omit raw counters and internal feed rank',()=>{
  const hat={id:'hat',views:9000,discovery_count:45,discoverers:['u'],explorer_score:9,
    rank_score:100,likes:5,orbit_score:20}
  assert.deepEqual(redactHatEngagement(hat),{id:'hat',likes:5,orbit_score:20})
  assert.deepEqual(redactHatEngagement(hat,{own:true}),{id:'hat',likes:5,orbit_score:20,views:9000})
  assert.equal(hat.views,9000)
})
test('public Orbit summary keeps credibility score, never exposes Discover or Explorer event breakdown',()=>{
 const orbit={score:30,byRole:{talent:{score:10},client:{score:20}},
    milestones:{verified:{by_verb:[{verb:'Discover',events:12},{verb:'Explorer',events:9}]}}}
 assert.deepEqual(publicOrbitSummary(orbit),{score:30,max:null,byRole:{talent:{score:10,max:null},client:{score:20,max:null}},disclaimer:undefined})
 assert.equal(publicOrbitSummary(null),null)
})
