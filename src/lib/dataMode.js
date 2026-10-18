import {useEffect,useState} from 'react'
const KEY='chombutar_data_mode'
const EVENT='chombutar:data-mode'
export function getDataMode(){
  try{return localStorage.getItem(KEY)==='text'?'text':'normal'}catch{return 'normal'}
}
export function setDataMode(mode){
  const value=mode==='text'?'text':'normal'
  try{localStorage.setItem(KEY,value)}catch{}
  window.dispatchEvent(new CustomEvent(EVENT,{detail:value}))
}
export function useDataMode(){
  const [mode,setMode]=useState(getDataMode)
  useEffect(()=>{
    const update=()=>setMode(getDataMode())
    window.addEventListener(EVENT,update)
    window.addEventListener('storage',update)
    return()=>{window.removeEventListener(EVENT,update);window.removeEventListener('storage',update)}
  },[])
  return mode
}
