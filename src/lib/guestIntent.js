// Only locally generated, allowlisted destinations may survive authentication.
// This prevents open redirects and arbitrary post-login API actions.
import {safeVibeReturnPath} from './vibeSharing.js'
export const GUEST_INTENTS=Object.freeze(['keepup','book','collab','hire','sponsor','save','like','share','comment','message'])
const USERNAME=/^[a-z0-9._-]{3,30}$/i
const UUID=/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i
const ORIGIN='https://chombutar.invalid'

export function parseGuestResume(value){
  if(typeof value!=='string'||value.length>220||!value.startsWith('/guest-resume?')||value.startsWith('//'))return null
  try {
    const url=new URL(value,ORIGIN)
    if(url.origin!==ORIGIN||url.pathname!=='/guest-resume'||url.hash)return null
    if([...url.searchParams.keys()].some(key=>!['intent','username','hat','resource'].includes(key)))return null
    if(['intent','username','hat','resource'].some(key=>url.searchParams.getAll(key).length>1))return null
    const intent=url.searchParams.get('intent'),username=url.searchParams.get('username'),hat=url.searchParams.get('hat'),resource=url.searchParams.get('resource')||'hat'
    if(!GUEST_INTENTS.includes(intent)||!USERNAME.test(username||''))return null
    if(hat&&!UUID.test(hat))return null
    if(!['hat','vibe'].includes(resource)||resource==='vibe'&&!hat)return null
    return {intent,username,hat:hat||null,resource}
  }catch{return null}
}

export function guestResumePath({intent,username,hat,resource='hat'}={}){
  if(!GUEST_INTENTS.includes(intent)||!USERNAME.test(String(username||'')))return null
  if(hat&&!UUID.test(String(hat)))return null
  if(!['hat','vibe'].includes(resource)||resource==='vibe'&&!hat)return null
  const params=new URLSearchParams({intent,username})
  if(hat)params.set('hat',hat)
  if(resource==='vibe')params.set('resource','vibe')
  return '/guest-resume?'+params.toString()
}

export function safeAuthReturnPath(value){
  if(typeof value!=='string'||value.length>220||!value.startsWith('/')||value.startsWith('//'))return null
  if(value==='/showroom'||value==='/bento'||value==='/vibes')return value
  const vibe=safeVibeReturnPath(value)
  if(vibe)return vibe
  const parsed=parseGuestResume(value)
  return parsed?guestResumePath(parsed):null
}

export function guestAuthUrl(mode,details){
  const next=guestResumePath(details)
  const qs=new URLSearchParams({mode:mode==='login'?'login':'signup'})
  if(next)qs.set('next',next)
  return '/auth?'+qs.toString()
}
