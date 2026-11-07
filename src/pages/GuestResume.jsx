import {useCallback,useEffect,useRef,useState} from 'react'
import {Link,useNavigate,useLocation} from 'react-router-dom'
import {api} from '../lib/api.js'
import {parseGuestResume} from '../lib/guestIntent.js'

export default function GuestResume(){
  const location=useLocation(),navigate=useNavigate()
  const intent=parseGuestResume(location.pathname+location.search)
  const started=useRef(false)
  const [error,setError]=useState(''),[busy,setBusy]=useState(true)
  const complete=useCallback(async()=>{
    if(!intent){setError('This return link has expired or is invalid.');setBusy(false);return}
    setBusy(true);setError('')
    try{
      const profile=await api.getUserProfile(intent.username)
      const target=profile?.user
      if(!target?.id||target.username?.toLowerCase()!==intent.username.toLowerCase())
        throw new Error('Could not identify the selected Talent.')
      if(intent.intent==='keepup'){
        // The signed-in account is the only actor. The backend checks member
        // identity, inserts atomically and awards KeepUp at most once per pair.
        let isFollowing=false
        const social=await api.getAssociates(target.username)
        isFollowing=Boolean(social.following)
        if(!isFollowing){
          try{await api.associateAction({action:'associate_follow',other_id:target.id})}
          catch(error){
            // A racing follow can yield 409. Verify the resulting relationship
            // before reporting success; do not mask migration or other errors.
            if(error.status!==409)throw error
            const updated=await api.getAssociates(target.username)
            if(!updated.following)throw error
          }
        }
        navigate('/profile/'+encodeURIComponent(target.username)+'?welcome=1&keepup=1',{replace:true})
      }else if(intent.resource==='vibe'&&intent.hat){
        navigate('/vibes?post='+encodeURIComponent(intent.hat),{replace:true})
      }else if(intent.hat){
        navigate('/talent/'+encodeURIComponent(intent.hat)+'?welcome=1',{replace:true})
      }else{
        navigate('/profile/'+encodeURIComponent(target.username)+'?welcome=1',{replace:true})
      }
    }catch(e){setError(e.message||'Could not complete your request.');setBusy(false)}
  },[intent?.intent,intent?.username,intent?.hat,intent?.resource,navigate])
  useEffect(()=>{
    if(started.current)return
    started.current=true
    void complete()
  },[complete])
  return <div className="mx-auto max-w-lg rounded-[24px] bg-white p-7 text-center shadow-sm">
    <h1 className="text-[23px] font-black">Welcome to ChombuTar</h1>
    <p className="mt-2 text-[13px] text-black/60">{busy?'Returning you to the Talent you chose…':error?'Your account is signed in. The action was not completed.':''}</p>
    {error&&<p role="alert" className="mt-4 rounded-xl bg-red-50 p-3 text-[13px] text-red-700">{error}</p>}
    {!busy&&<div className="mt-5 flex flex-wrap justify-center gap-3">
      {intent&&<button type="button" onClick={()=>void complete()} className="min-h-11 rounded-full bg-[#E8B447] px-5 text-[12px] font-extrabold">Retry action</button>}
      <Link to={intent?'/profile/'+encodeURIComponent(intent.username):'/showroom'}
        className="inline-flex min-h-11 items-center rounded-full border border-black/15 px-5 text-[12px] font-bold">Continue browsing</Link>
    </div>}
  </div>
}
