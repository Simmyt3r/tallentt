// One inbox row per real account, while preserving separate permissions,
// payment histories and thread identifiers. Never dedupe by display name.
const KIND_LABELS={bento:'Bento deal',associates:'Associate chat',employment:'Employment'}
export function consolidateInbox(threads=[]){
  const people=new Map()
  for(const entry of threads){
    const peerId=entry.peer_id
    const identity=peerId?String(peerId):entry.peer_username
      ?'username:'+String(entry.peer_username).toLowerCase()
      :'thread:'+entry.kind+':'+entry.id
    const existing=people.get(identity)
    const when=entry.last_at||entry.updated_at||entry.created_at
    const recent=new Date(when||0).getTime()||0
    if(!existing){
      people.set(identity,{id:identity,peer_id:peerId||null,name:entry.name,
        peer_username:entry.peer_username,peer_avatar:entry.peer_avatar,
        unread_count:Number(entry.unread_count||0),last_message:entry.last_message||entry.hat_title||'',
        last_at:when,sortTime:recent,threads:[entry]})
    }else{
      existing.threads.push(entry)
      existing.unread_count+=Number(entry.unread_count||0)
      if(recent>existing.sortTime){
        existing.sortTime=recent
        existing.last_at=when
        existing.last_message=entry.last_message||entry.hat_title||''
        existing.name=entry.name||existing.name
        existing.peer_avatar=entry.peer_avatar||existing.peer_avatar
      }
    }
  }
  return [...people.values()].map(person=>({...person,
    threads:person.threads.sort((a,b)=>
      (new Date(b.last_at||b.updated_at||b.created_at).getTime()||0)-
      (new Date(a.last_at||a.updated_at||a.created_at).getTime()||0)),
    channels:[...new Set(person.threads.map(t=>KIND_LABELS[t.kind]||t.kind))],
  })).sort((a,b)=>b.sortTime-a.sortTime)
}
export const chatLabel=entry=>entry.kind==='bento'
  ?'Bento · '+(entry.hat_title||'Deal')
  :entry.kind==='employment'?'Employment · '+(entry.hat_title||'Agreement')
  :'Associate chat'
