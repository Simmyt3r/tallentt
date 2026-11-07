// One signed-in qualified Discovery session for an *intentionally opened*
// Talent Hat. Share/Save/Like and second-media actions remain separate from
// passive views; the server validates evidence and the five active seconds.
import {useCallback,useEffect,useRef} from 'react'
import {api} from './api.js'
import {useAuth} from '../context/AuthContext.jsx'

export function useQualifiedDiscovery({hatId,ownerId,role,active=true}){
  const {user}=useAuth()
  const viewerId=user?.id||null
  const eligible=Boolean(active&&hatId&&ownerId&&viewerId&&viewerId!==ownerId&&role==='talent')
  const stateRef=useRef(null)
  const openingRef=useRef(null)

  const complete=useCallback(async()=>{
    const session=stateRef.current
    if(!session?.id||session.done||session.inFlight||!session.proof||document.hidden)return
    session.inFlight=true
    try{
      const result=await api.discoveryAction('discovery_complete',{session_id:session.id})
      if(['awarded','held','rejected'].includes(result.status)||result.alreadyProcessed)
        session.done=true
    }catch(error){
      // A premature proof check should be retried after fresh heartbeats.
      if(![409,410,503].includes(error?.status))
        console.warn('Qualified Discovery could not complete',error)
      if(error?.status===410)session.done=true
    }finally{session.inFlight=false}
  },[])

  useEffect(()=>{
    stateRef.current=null
    openingRef.current=null
    if(!eligible)return undefined
    let mounted=true
    const opening=api.discoveryAction('discovery_open',{hat_id:hatId})
      .then(result=>{
        if(!mounted||!result?.session_id)return null
        const session={id:result.session_id,proof:false,inFlight:false,done:false}
        stateRef.current=session
        return session
      }).catch(()=>null)
    openingRef.current=opening
    const heartbeats=setInterval(()=>{
      const session=stateRef.current
      if(!mounted||!session||session.done||document.hidden)return
      void api.discoveryAction('discovery_heartbeat',{
        session_id:session.id,visible:true,
      }).then(()=>{if(mounted&&session.proof)void complete()}).catch(()=>{})
    },2800)
    // Two spaced server heartbeats must span >= 5 active seconds. An
    // early Like/Save/Share cannot credit a passive or one-second view.
    const retry=setTimeout(()=>{if(mounted)void complete()},12500)
    return()=>{mounted=false;stateRef.current=null;openingRef.current=null;clearInterval(heartbeats);clearTimeout(retry)}
  },[eligible,hatId,ownerId,viewerId,complete])

  const markEngagement=useCallback(async()=>{
    const session=await openingRef.current
    if(!session||stateRef.current!==session)return false
    session.proof=true
    void complete()
    return true
  },[complete])

  const recordEvidence=useCallback(async(kind,extra={})=>{
    const session=await openingRef.current
    if(!session||stateRef.current!==session||document.hidden)return false
    try{
      await api.discoveryAction('discovery_evidence',{
        session_id:session.id,kind,...extra,
      })
      session.proof=true
      void complete()
      return true
    }catch(error){
      if(![409,410,503].includes(error?.status))
        console.warn('Qualified Discovery proof rejected',error)
      return false
    }
  },[complete])

  return {eligible,markEngagement,recordEvidence}
}
