// Pure Release B validation shared by API and regression tests.
export const uuid=value=>typeof value==='string'&&
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value)
const bad=message=>{throw Object.assign(new Error(message),{status:400})}
const str=(v,name,min,max)=>{
  if(typeof v!=='string')bad(name+' is required.')
  const s=v.trim()
  if(s.length<min||s.length>max)bad(name+' must be '+min+'–'+max+' characters.')
  return s
}
export function validateAdvertiserName(value){return str(value,'Registered business name',2,180)}
export function validateCampaignDraft(raw){
  if(!raw||typeof raw!=='object'||Array.isArray(raw))bad('Campaign fields required.')
  return {title:str(raw.title,'Campaign title',2,180),
    location:raw.location==null||raw.location===''?null:str(raw.location,'Target location',2,120),
    workType:raw.work_type==null||raw.work_type===''?null:str(raw.work_type,'Work category',2,120)}
}
export function validateCreative(raw,cloudName){
  if(!cloudName||!/^[a-z0-9_-]{2,80}$/i.test(cloudName))
    throw Object.assign(new Error('Campaign media provider is not configured.'),{status:503})
  if(!['image','video'].includes(raw?.media_type))bad('Creative must be an image or video.')
  const type=raw.media_type
  const input=str(raw.media_url,'Creative media URL',20,2048)
  let url
  try{url=new URL(input)}catch{bad('Invalid creative media URL.')}
  const prefix='/'+cloudName+'/'+type+'/upload/'
  if(url.protocol!=='https:'||url.hostname!=='res.cloudinary.com'||url.username||url.password||
    url.port||url.search||url.hash||!url.pathname.startsWith(prefix)||
    url.pathname.length<=prefix.length||/[%\\]/.test(url.pathname))
    bad('Creative must be an approved-format ChombuTar Cloudinary upload URL.')
  return {type,url:url.href,caption:raw.caption?str(raw.caption,'Caption',1,300):''}
}
export function validateReview(body){
  if(!['advertiser','campaign','creative'].includes(body?.kind))bad('Invalid review target.')
  if(!uuid(body.id))bad('Invalid review identifier.')
  if(!['approved','rejected'].includes(body.decision))bad('Invalid review decision.')
  const note=body.note==null?'':str(body.note,'Review note',0,1000)
  if(body.decision==='rejected'&&note.length<8)bad('Rejection reason must be at least 8 characters.')
  return {kind:body.kind,id:body.id,decision:body.decision,note}
}
