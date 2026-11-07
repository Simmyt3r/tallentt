// Pure presentation projection: no extra Orbit points are awarded here.
// Classifying earned factors avoids confusing attention with completed work.
export function classifyOrbitEvidence(factors){
  const total=keys=>factors.filter(f=>keys.includes(f.key))
    .reduce((score,f)=>score+f.earned,0)
  return {
    verified_work:{points:total(['completed_work','successful_hires']),
      factors:factors.filter(f=>['completed_work','successful_hires'].includes(f.key)).map(f=>f.key)},
    showcase_activity:{points:total(['contributions']),
      factors:factors.filter(f=>f.key==='contributions').map(f=>f.key)},
    profile_history:{points:total(['profile','verification','tenure']),
      factors:factors.filter(f=>['profile','verification','tenure'].includes(f.key)).map(f=>f.key)},
  }
}
