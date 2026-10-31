// Canonical deep links and explicit destinations for Vibes sharing.
// Keep URLs on the current ChombuTar origin and encode every user-provided
// value with URLSearchParams (never concatenate raw post text into an href).
export function vibeShareUrl(postId, origin) {
  const id=String(postId||'')
  if(!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(id))
    throw new Error('Invalid Vibe link.')
  const base=new URL(origin)
  if(!['https:','http:'].includes(base.protocol))throw new Error('Invalid sharing origin.')
  const permalink=new URL('/vibes',base.origin)
  permalink.searchParams.set('post',id)
  return permalink.toString()
}

export function vibeShareText(post) {
  const display=String(post?.full_name||post?.username||'ChombuTar member').trim().slice(0,90)
  const excerpt=String(post?.body||'').replace(/\s+/g,' ').trim().slice(0,180)
  return excerpt ? `${display} on ChombuTar: ${excerpt}` : `See ${display}'s Vibe on ChombuTar`
}

export function vibeShareDestinations(url,text) {
  const encodedUrl=encodeURIComponent(url)
  const encodedText=encodeURIComponent(text)
  return [
    {id:'whatsapp',label:'WhatsApp',href:`https://api.whatsapp.com/send?text=${encodeURIComponent(text+' '+url)}`},
    {id:'facebook',label:'Facebook',href:`https://www.facebook.com/sharer/sharer.php?u=${encodedUrl}`},
    {id:'x',label:'X (Twitter)',href:`https://twitter.com/intent/tweet?text=${encodedText}&url=${encodedUrl}`},
    {id:'telegram',label:'Telegram',href:`https://t.me/share/url?url=${encodedUrl}&text=${encodedText}`},
    {id:'linkedin',label:'LinkedIn',href:`https://www.linkedin.com/sharing/share-offsite/?url=${encodedUrl}`},
    {id:'email',label:'Email',href:`mailto:?subject=${encodeURIComponent('Vibe on ChombuTar')}&body=${encodeURIComponent(text+'\n\n'+url)}`},
  ]
}

const SAFE_BASE='https://chombutar.invalid'

// Only Vibes links with a genuine UUID are accepted as post-login redirects.
// An external URL, protocol-relative URL, path traversal or unrelated app
// path can never become an open redirect through the login screen.
export function safeVibeReturnPath(value) {
  if(typeof value!=='string'||!value.startsWith('/vibes')||value.startsWith('//')||value.length>220)return null
  // New comment pages are first-class sign-in return destinations, but only
  // for a valid canonical UUID and with no extra path, query or fragment.
  const commentPath=value.match(/^\/vibes\/([0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12})\/comments$/i)
  if(commentPath)return '/vibes/'+commentPath[1]+'/comments'
  if(!value.startsWith('/vibes?'))return null
  try{
    const url=new URL(value,SAFE_BASE)
    if(url.origin!==SAFE_BASE||url.pathname!=='/vibes')return null
    const ids=url.searchParams.getAll('post')
    if(ids.length!==1)return null
    const id=ids[0]
    if(!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(id))return null
    return '/vibes?post='+encodeURIComponent(id)
  }catch{return null}
}
