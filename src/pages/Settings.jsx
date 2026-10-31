import {useEffect,useState} from 'react'
import {useNavigate} from 'react-router-dom'
import {Bell,BookOpen,Eye,EyeOff,HardDriveDownload,LockKeyhole,Settings2,ShieldCheck,SlidersHorizontal,Wallet} from 'lucide-react'
import {useAuth} from '../context/AuthContext.jsx'
import PushNotificationSettings from '../components/PushNotificationSettings.jsx'
import {api} from '../lib/api.js'
import {clearSavedVideos,getSavedVideoSummary} from '../lib/offlineVideo.js'
import {restartPageTours} from '../lib/pageTour.js'
import {useWalletBalanceVisible} from '../lib/walletBalancePreference.js'

const SECTIONS=[
  ['general','General',SlidersHorizontal],
  ['notifications','Notifications',Bell],
  ['privacy','Privacy',ShieldCheck],
  ['security','Security',LockKeyhole],
  ['wallet','Wallet',Wallet],
]
const inputClass='mt-1 min-h-11 w-full rounded-xl border border-black/15 bg-white px-3 text-[13px] focus-visible:outline-2 focus-visible:outline-[#0A13E6]'
const optionLabel='block text-[12px] font-bold'
const checkboxClass='h-5 w-5 shrink-0 accent-[#0A13E6]'
function SwitchRow({label,checked,onChange,disabled=false}){
  return <label className="flex min-h-14 items-center justify-between gap-4 border-b border-black/10 py-3">
    <span className="text-[13px] font-semibold">{label}</span>
    <input type="checkbox" className={checkboxClass} checked={checked} disabled={disabled}
      onChange={e=>onChange(e.target.checked)}/>
  </label>
}
export default function Settings(){
  const {user}=useAuth()
  const navigate=useNavigate()
  const [section,setSection]=useState('general')
  const [notice,setNotice]=useState(''),[error,setError]=useState('')
  const [resetBusy,setResetBusy]=useState(false)
  const [presenceVisible,setPresenceVisible]=useState(true),[presenceBusy,setPresenceBusy]=useState(false)
  const [associatePolicy,setAssociatePolicy]=useState('everyone'),[associateBusy,setAssociateBusy]=useState(false)
  const [associateAvailable,setAssociateAvailable]=useState(true)
  const [content,setContent]=useState({installed:false,showroom_inquiries:'everyone',vibes_comments:'everyone'})
  const [privacyBusy,setPrivacyBusy]=useState(''),[loadingPrivacy,setLoadingPrivacy]=useState(true)
  const [balanceVisible,setBalanceVisible]=useWalletBalanceVisible(user?.id)
  const [stored,setStored]=useState({count:0,bytes:0}),[storageBusy,setStorageBusy]=useState(false)
  useEffect(()=>{
    let active=true
    api.getPresenceVisibility().then(r=>{if(active)setPresenceVisible(r.visible!==false)})
      .catch(()=>{})
    api.getAssociatePrivacy().then(r=>{if(active)setAssociatePolicy(r.privacy||'everyone')})
      .catch(e=>{if(active){setAssociateAvailable(false);setError(e.message||'Associate preferences are unavailable.')}})
    api.getContentPrivacy().then(r=>{if(active)setContent(r)})
      .catch(e=>{if(active)setError(e.message||'Could not load content privacy settings.')})
      .finally(()=>{if(active)setLoadingPrivacy(false)})
    return()=>{active=false}
  },[])
  useEffect(()=>{
    let active=true
    getSavedVideoSummary().then(result=>{if(active)setStored(result)}).catch(()=>{})
    return()=>{active=false}
  },[])
  function showSection(value){setSection(value);setError('');setNotice('')}
  async function setPresence(visible){
    setPresenceBusy(true);setError('')
    try{await api.setPresenceVisibility(visible);setPresenceVisible(visible)}
    catch(e){setError(e.message||'Could not update your online status.')}
    finally{setPresenceBusy(false)}
  }
  async function setAssociate(value){
    if(value==='nobody'&&!window.confirm('Stop receiving new Associate requests? Existing Associates will remain connected.'))return
    setAssociateBusy(true);setError('')
    try{const result=await api.associateAction({action:'associate_privacy',policy:value});setAssociatePolicy(result.privacy)}
    catch(e){setError(e.message||'Could not update Associate request settings.')}
    finally{setAssociateBusy(false)}
  }
  async function setContentPolicy(field,value){
    if(value!=='everyone'&&!window.confirm(field==='showroom_inquiries'
      ? 'This will limit new Showroom booking inquiries. Existing deals and conversations remain available. Continue?'
      : 'This will limit new comments on your Vibes. Existing comments remain visible. Continue?'))return
    setPrivacyBusy(field);setError('')
    try{const result=await api.updateContentPrivacy(field,value);setContent(result)}
    catch(e){setError(e.message||'Could not update privacy preference.')}
    finally{setPrivacyBusy('')}
  }
  async function sendReset(){
    if(resetBusy||!user?.email)return
    setResetBusy(true);setError('');setNotice('')
    try{await api.requestPasswordReset(user.email)
      setNotice('If an email can be delivered, a password reset link will be sent to your registered address.')}
    catch(e){setError(e.message||'Could not request a reset link.')}
    finally{setResetBusy(false)}
  }
  async function removeOffline(){
    if(!stored.count||storageBusy)return
    if(!window.confirm('Remove all '+stored.count+' offline Vibes videos saved on this device? You can save them again later.'))return
    setStorageBusy(true);setError('');setNotice('')
    try{await clearSavedVideos();setStored({count:0,bytes:0});setNotice('Offline Vibes videos cleared from this browser.')}
    catch(e){setError(e.message||'Could not clear saved videos.')}
    finally{setStorageBusy(false)}
  }
  const storedMB=(stored.bytes/(1024*1024)).toLocaleString('en-NG',{maximumFractionDigits:1})
  return <main className="mx-auto max-w-[820px] space-y-4 pb-12">
    <header className="flex items-center gap-2 pt-2">
      <Settings2 size={21} className="text-[#0A13E6]" aria-hidden="true"/>
      <h1 className="text-[22px] font-black tracking-tight">Settings</h1>
    </header>
    <nav aria-label="Settings sections" className="grid grid-cols-3 gap-2 sm:grid-cols-5">
      {SECTIONS.map(([id,label,Icon])=><button type="button" key={id}
        onClick={()=>showSection(id)} aria-pressed={section===id}
        className={`flex min-h-14 min-w-0 flex-col items-center justify-center gap-1 rounded-xl px-1.5 py-2 text-[11px] font-bold transition sm:min-h-11 sm:flex-row sm:gap-2 sm:px-2 ${section===id?'bg-[#0A13E6] text-white':'border border-black/10 bg-white text-black/65 hover:bg-[#F1F1FF]'}`}>
        <Icon size={16} aria-hidden="true" className="shrink-0"/><span className="break-words text-center">{label}</span>
      </button>)}
    </nav>
    {error&&<p role="alert" className="rounded-xl bg-red-50 p-3 text-[12px] text-red-700">{error}</p>}
    {notice&&<p role="status" className="rounded-xl bg-blue-50 p-3 text-[12px] text-blue-900">{notice}</p>}
    {section==='general'&&<section aria-label="General preferences" className="divide-y divide-black/10">
      <div className="py-3">
        <h2 className="text-[14px] font-black">Page introductions</h2>
        <button type="button" disabled={!user?.id} onClick={()=>{restartPageTours(user.id);navigate('/showroom')}}
          className="mt-3 inline-flex min-h-11 items-center gap-2 rounded-xl border border-black/15 px-4 text-[12px] font-bold disabled:opacity-50">
          <BookOpen size={16}/> Restart page tour
        </button>
      </div>
      <div className="py-3">
        <h2 className="text-[14px] font-black">Storage &amp; downloads</h2>
        <div className="mt-3 flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-2 text-[12px] text-black/65">
            <HardDriveDownload size={17}/> Offline Vibes videos
            <span className="font-semibold">{stored.count} saved{stored.count>0?` · ~${storedMB} MB`:''}</span>
          </div>
          {stored.count>0&&<button type="button" disabled={storageBusy} onClick={removeOffline}
            className="min-h-11 rounded-xl border border-red-200 px-4 text-[12px] font-bold text-red-700 disabled:opacity-50">
            {storageBusy?'Clearing…':'Clear saved videos'}
          </button>}
        </div>
      </div>
    </section>}
    {section==='notifications'&&<div aria-label="Notification preferences">
      <PushNotificationSettings/>
    </div>}
    {section==='privacy'&&<section aria-label="Privacy preferences" className="space-y-5">
      <div>
        <h2 className="text-[14px] font-black">Presence</h2>
        <SwitchRow label="Show when I am online" checked={presenceVisible} onChange={setPresence} disabled={presenceBusy}/>
      </div>
      <div>
        <h2 className="text-[14px] font-black">Associates</h2>
        <label htmlFor="associate-request-policy" className={optionLabel}>Who may send Associate requests?</label>
        <select id="associate-request-policy" className={inputClass}
          value={associatePolicy} disabled={!associateAvailable||associateBusy} onChange={e=>setAssociate(e.target.value)}>
          <option value="everyone">Everyone</option>
          <option value="verified_talents">Verified talents only</option>
          <option value="nobody">No one</option>
        </select>
      </div>
      <div>
        <h2 className="text-[14px] font-black">Showroom</h2>
        <label htmlFor="showroom-inquiry-policy" className={optionLabel}>Who may start new hiring inquiries with me?</label>
        <select id="showroom-inquiry-policy" className={inputClass} value={content.showroom_inquiries}
          disabled={loadingPrivacy||!content.installed||Boolean(privacyBusy)}
          onChange={e=>setContentPolicy('showroom_inquiries',e.target.value)}>
          <option value="everyone">Everyone</option>
          <option value="verified_clients">Verified clients only</option>
          <option value="nobody">Pause new inquiries</option>
        </select>
      </div>
      <div>
        <h2 className="text-[14px] font-black">Hits &amp; Vibes</h2>
        <label htmlFor="vibes-comments-policy" className={optionLabel}>Who may comment on my Vibes?</label>
        <select id="vibes-comments-policy" className={inputClass} value={content.vibes_comments}
          disabled={loadingPrivacy||!content.installed||Boolean(privacyBusy)}
          onChange={e=>setContentPolicy('vibes_comments',e.target.value)}>
          <option value="everyone">Everyone</option>
          <option value="associates">Accepted Associates only</option>
          <option value="nobody">Only me</option>
        </select>
      </div>
      {!loadingPrivacy&&!content.installed&&<p role="status" className="text-[11px] text-amber-800">
        An administrator must apply the Subscriber Content Privacy migration to enable Showroom and Vibes restrictions.
      </p>}
    </section>}
    {section==='security'&&<section aria-label="Security preferences" className="space-y-3">
      <h2 className="text-[14px] font-black">Password and access</h2>
      <button type="button" onClick={sendReset} disabled={resetBusy||!user?.email}
        className="inline-flex min-h-11 items-center gap-2 rounded-xl bg-[#0A13E6] px-5 text-[12px] font-bold text-white disabled:opacity-45">
        <LockKeyhole size={16}/> {resetBusy?'Sending…':'Email password reset link'}
      </button>
    </section>}
    {section==='wallet'&&<section aria-label="Wallet preferences" className="divide-y divide-black/10">
      <h2 className="pb-2 text-[14px] font-black">Balance display</h2>
      <div className="flex min-h-14 items-center justify-between gap-4 border-b border-black/10 py-3">
        <span className="text-[13px] font-semibold">Show wallet balances</span>
        <button type="button" onClick={()=>setBalanceVisible(!balanceVisible)}
          aria-label={balanceVisible?'Hide wallet balances':'Show wallet balances'}
          aria-pressed={balanceVisible}
          className="grid h-11 w-11 shrink-0 place-items-center rounded-full border border-black/15 hover:bg-[#F7F3EB]">
          {balanceVisible?<Eye size={19}/>:<EyeOff size={19}/>}
        </button>
      </div>
    </section>}
  </main>
}
