// Native share where supported, with deterministic URL-copy fallback.
export async function shareContent(path,title='ChombuTar'){
  const url=new URL(path,window.location.origin).toString()
  if(navigator.share){
    try{await navigator.share({title,url});return 'shared'}
    catch(error){if(error?.name==='AbortError')return 'cancelled'}
  }
  if(navigator.clipboard?.writeText){
    await navigator.clipboard.writeText(url)
    return 'copied'
  }
  const node=document.createElement('textarea')
  node.value=url;node.style.position='fixed';node.style.opacity='0'
  document.body.append(node);node.select()
  const copied=document.execCommand('copy')
  node.remove()
  if(!copied)throw new Error('Unable to copy link.')
  return 'copied'
}