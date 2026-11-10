// Release E: NONBILLABLE preview presentation rules. This is not an ad
// delivery meter and is never acceptable as a pricing or payout record.
export const SHOWROOM_AD_POLICY=Object.freeze({
  postsBetweenAds:4,maximumAdsPerSession:2,skipAfterSeconds:5,maximumPlaybackSeconds:15,
})
export function trustedShowroomVideoUrl(input,cloud){
  if(typeof input!=='string'||typeof cloud!=='string'||!(/^[a-z0-9_-]{2,80}$/i).test(cloud))return false
  try{
    const url=new URL(input)
    const prefix='/'+cloud+'/video/upload/'
    return url.protocol==='https:'&&url.hostname==='res.cloudinary.com'
      &&!url.username&&!url.password&&!url.port&&!url.hash&&!url.search
      &&url.pathname.startsWith(prefix)&&url.pathname.length>prefix.length
      &&!/[%\\]/.test(url.pathname)
  }catch{return false}
}
export function canOfferShowroomAd({
  enabled=false,view='for_you',hasSearch=false,postCount=0,
  shownCount=0,lastShownAt=0,hasActiveAd=false,hasDialog=false,
  isVisible=true,eligibleHat=false,alreadyAttempted=false,
}={}){
  return enabled&&view!=='top12'&&!hasSearch&&isVisible&&!hasDialog
    &&!hasActiveAd&&eligibleHat&&!alreadyAttempted
    &&Number.isInteger(postCount)&&Number.isInteger(shownCount)
    &&Number.isInteger(lastShownAt)&&shownCount>=0&&lastShownAt>=0
    &&shownCount<SHOWROOM_AD_POLICY.maximumAdsPerSession
    &&postCount>=SHOWROOM_AD_POLICY.postsBetweenAds
    &&postCount-lastShownAt>=SHOWROOM_AD_POLICY.postsBetweenAds
}
export const eligibleVideoAdResponse=(value,hatId,cloud)=>
  Boolean(value&&value.hat_id===hatId&&
    typeof value.id==='string'&&typeof value.sponsor_name==='string'
    &&trustedShowroomVideoUrl(value.video_url,cloud)
    &&Date.parse(value.ends_at)>Date.now())
