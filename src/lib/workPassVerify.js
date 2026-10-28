// Offline verifier for signed claims. Cache the trusted public key BEFORE
// going offline; an untrusted QR must never be allowed to supply its own key.
const decode = str => {
  const binary=atob(str.replace(/-/g,'+').replace(/_/g,'/')+'='.repeat((4-str.length%4)%4))
  return Uint8Array.from(binary,ch=>ch.charCodeAt(0))
}
export async function verifyWorkPassToken(token,publicKey){
  const parts=String(token||'').split('.')
  if(parts.length!==4||parts[0]!=='CTWP1')throw Error('Unknown Work Pass format.')
  const trusted=(publicKey?.keys||[]).find(item=>item.keyId===parts[1])
    ||(publicKey?.keyId===parts[1]&&publicKey.jwk?{keyId:publicKey.keyId,jwk:publicKey.jwk}:null)
  if(!trusted?.jwk)throw Error('Unknown or retired Work Pass signing key. Refresh trusted keys online.')
  const key=await crypto.subtle.importKey('jwk',trusted.jwk,{name:'ECDSA',namedCurve:'P-256'},false,['verify'])
  const signed=parts.slice(0,3).join('.')
  const valid=await crypto.subtle.verify({name:'ECDSA',hash:'SHA-256'},key,decode(parts[3]),new TextEncoder().encode(signed))
  if(!valid)throw Error('Work Pass signature invalid.')
  const claim=JSON.parse(new TextDecoder().decode(decode(parts[2])))
  if(!claim?.id||!claim?.username||!Number.isFinite(claim.expiresAt)||Date.now()/1000>claim.expiresAt)
    throw Error('Work Pass expired or incomplete.')
  return claim
}
