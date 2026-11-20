// Public listings and card responses may show Orbit and normal social actions,
// but not raw views, Discovery counts, Explorer scores or internal rank scores.
// A signed-in Hat owner may access only their own raw view total via Hat APIs.
export function redactHatEngagement(hat,{own=false}={}){
  if(!hat)return hat
  const {views,view_count,discovery_count,discover_count,discoverer_count,discoveries,
    discoverers,found_by,explorer_score,rank_score,...safe}=hat
  return own&&views!==undefined?{...safe,views}:safe
}
export function publicOrbitSummary(orbit){
  if(!orbit)return orbit
  const {milestones,...summary}=orbit
  return summary
}
