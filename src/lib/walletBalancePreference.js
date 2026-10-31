import {useEffect,useState} from 'react'
const EVENT='chombutar:wallet-visibility'
const key=id=>'chombutar:wallet-visibility:'+String(id||'anonymous')
export function getWalletBalanceVisible(userId){
  if(!userId)return false
  try{return localStorage.getItem(key(userId))==='visible'}catch{return false}
}
export function setWalletBalanceVisible(userId,visible){
  if(!userId)return
  try{localStorage.setItem(key(userId),visible?'visible':'hidden')}catch{}
  window.dispatchEvent(new CustomEvent(EVENT,{detail:{userId,visible:Boolean(visible)}}))
}
export function useWalletBalanceVisible(userId){
  const [visible,setVisible]=useState(()=>getWalletBalanceVisible(userId))
  useEffect(()=>{
    const sync=()=>setVisible(getWalletBalanceVisible(userId))
    sync()
    window.addEventListener(EVENT,sync)
    window.addEventListener('storage',sync)
    return()=>{window.removeEventListener(EVENT,sync);window.removeEventListener('storage',sync)}
  },[userId])
  return [visible,value=>setWalletBalanceVisible(userId,value)]
}
