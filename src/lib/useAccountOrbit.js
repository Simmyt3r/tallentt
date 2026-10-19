import {useEffect,useRef,useState} from 'react'
import {api} from './api.js'
const cached=new Map()
export function useAccountOrbit(username){
  const node=useRef(null)
  const [score,setScore]=useState(null)
  const [resolved,setResolved]=useState(false)
  useEffect(()=>{
    const key=String(username||'').trim().replace(/^[@^]+/,'').toLowerCase()
    if(!key)return undefined
    let mounted=true
    let started=false
    const request=()=>{
      if(started)return
      started=true
      let entry=cached.get(key)
      if(!entry||Date.now()-entry.at>60000){
        entry={at:Date.now(),promise:api.getUserProfile(key)
          .then(data=>Number.isFinite(Number(data?.orbit?.score))?Number(data.orbit.score):null)
          .catch(()=>null)}
        cached.set(key,entry)
      }
      entry.promise.then(value=>{if(mounted){setScore(value);setResolved(true)}})
    }
    let observer
    if(typeof IntersectionObserver!=='undefined'&&node.current){
      observer=new IntersectionObserver(entries=>{
        if(entries.some(e=>e.isIntersecting)){request();observer?.disconnect()}
      },{rootMargin:'160px'})
      observer.observe(node.current)
    }else request()
    return()=>{mounted=false;observer?.disconnect()}
  },[username])
  return {node,score,resolved}
}
