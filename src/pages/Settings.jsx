import {useEffect,useState} from 'react'
import {Link,useNavigate} from 'react-router-dom'
import {Bell,BookOpen,LockKeyhole,LogOut,Settings2,UserRound,Wallet} from 'lucide-react'
import {useAuth} from '../context/AuthContext.jsx'
import PushNotificationSettings from '../components/PushNotificationSettings.jsx'
import {api} from '../lib/api.js'
import {useDataMode,setDataMode} from '../lib/dataMode.js'
import {clearSavedVideos} from '../lib/offlineVideo.js'
import {restartPageTours} from '../lib/pageTour.js'

export default function Settings(){
  const {user,logout}=useAuth()
  const dataMode=useDataMode()
  const navigate=useNavigate()
  const [section,setSection]=useState('account')
  const [resetBusy,setResetBusy]=useState(false)
  const [notice,setNotice]=useState('')
  const [error,setError]=useState('')
  const [signingOut,setSigningOut]=useState(false)
  const [presenceVisible,setPresenceVisible]=useState(true)
  const [presenceBusy,setPresenceBusy]=useState(false)
  useEffect(()=>{
    let active=true
    api.getPresenceVisibility().then(value=>{if(active)setPresenceVisible(value.visible!==false)})
      .catch(()=>{})
    return()=>{active=false}
  },[])
  async function changePresence(visible){
    setPresenceBusy(true);setError('')
    try{await api.setPresenceVisibility(visible);setPresenceVisible(visible)}
    catch(e){setError(e.message||'Unable to save presence setting.')}
    finally{setPresenceBusy(false)}
  }
  async function requestReset(){
    if(resetBusy || !user?.email)return
    setResetBusy(true);setError('');setNotice('')
    try {
      await api.requestPasswordReset(user.email)
      setNotice('If a recovery email can be delivered, it will be sent to your registered address. Check your inbox or spam folder.')
    }catch(err){setError(err.message||'Could not request a password reset.')}
    finally{setResetBusy(false)}
  }
  async function signOut(){
    if(signingOut)return
    setSigningOut(true);setError('')
    try {await logout();navigate('/auth',{replace:true})}
    catch(err){setError(err.message||'Could not sign out.')}
    finally{setSigningOut(false)}
  }
  return <main className="mx-auto max-w-[820px] space-y-5 pb-10">
    <header className="sticky top-14 md:top-16 z-10 -mx-4 border-b border-black/10 bg-[#F7F3EB]/95 px-4 py-3 backdrop-blur-lg md:-mx-6 md:px-6">
      <h1 className="flex items-center gap-2 text-[22px] font-black"><Settings2 size={21}/> Settings</h1>
      <p className="mt-1 text-[12px] text-black/55">Manage your account, device notifications and security.</p>
    </header>
    <nav aria-label="Settings sections" className="flex gap-2">
      {[['account','Account',UserRound],['notifications','Notifications',Bell],['security','Security',LockKeyhole]].map(([id,label,Icon])=>
        <button key={id} type="button" onClick={()=>setSection(id)} aria-pressed={section===id}
          className={`inline-flex min-h-11 flex-1 items-center justify-center gap-2 rounded-xl px-3 text-[12px] font-bold ${section===id?'bg-[#0A13E6] text-white':'border border-black/10 bg-white text-black/70'}`}>
          <Icon size={15}/>{label}
        </button>)}
    </nav>
    {error&&<p role="alert" className="rounded-xl bg-red-50 p-4 text-[12px] text-red-700">{error}</p>}
    {notice&&<p role="status" className="rounded-xl bg-blue-50 p-4 text-[12px] text-blue-900">{notice}</p>}
    {section==='account'&&<section className="space-y-3 rounded-2xl border border-black/10 bg-white p-5">
      <h2 className="text-[15px] font-black">Account information</h2>
      <dl className="divide-y divide-black/10">
        <div className="flex items-center justify-between gap-3 py-3">
          <dt className="text-[12px] text-black/50">Username</dt>
          <dd className="truncate text-[12px] font-semibold">{user?.username||'Not set'}</dd>
        </div>
        <div className="flex items-center justify-between gap-3 py-3">
          <dt className="text-[12px] text-black/50">Email</dt>
          <dd className="truncate text-[12px] font-semibold">{user?.email||'Not set'}</dd>
        </div>
        <div className="flex items-center justify-between gap-3 py-3">
          <dt className="text-[12px] text-black/50">Account type</dt>
          <dd className="capitalize text-[12px] font-semibold">{user?.role||'Subscriber'}</dd>
        </div>
      </dl>
      <label className="flex items-center justify-between gap-4 rounded-xl border border-black/10 bg-[#F7F3EB] p-3">
        <span>
          <span className="block text-[12px] font-bold">Text-only browsing (data saver)</span>
          <span className="mt-1 block text-[11px] text-black/55">Skip Showroom and Vibes media until you tap to load a post. Your previously cached images remain available offline.</span>
        </span>
        <input type="checkbox" checked={dataMode==='text'}
          onChange={e=>setDataMode(e.target.checked?'text':'normal')}
          aria-label="Browse in text-only data saving mode" className="h-5 w-5 shrink-0 accent-[#0A13E6]"/>
      </label>
      <button type="button" onClick={()=>clearSavedVideos().then(()=>setNotice('Saved offline videos cleared.')).catch(()=>setError('Unable to clear offline videos.'))}
        className="min-h-10 rounded-full border border-black/20 px-4 text-[12px] font-bold">
        Clear saved offline videos
      </button>
      <label className="flex items-center justify-between gap-4 rounded-xl border border-black/10 bg-[#F7F3EB] p-3">
        <span>
          <span className="block text-[12px] font-bold">Show when I am online</span>
          <span className="mt-1 block text-[11px] text-black/55">A green indicator appears only while you are active in ChombuTar. Turn this off to stay private.</span>
        </span>
        <input type="checkbox" checked={presenceVisible} disabled={presenceBusy}
          onChange={e=>changePresence(e.target.checked)}
          aria-label="Show my online status" className="h-5 w-5 shrink-0 accent-[#0A13E6]"/>
      </label>
      <div className="rounded-xl border border-black/10 bg-[#F7F3EB] p-3">
        <div className="flex items-start gap-2.5">
          <BookOpen size={18} aria-hidden="true" className="mt-0.5 shrink-0 text-[#0A13E6]"/>
          <div>
            <h3 className="text-[12px] font-bold">Page introductions</h3>
            <p className="mt-1 text-[11px] leading-relaxed text-black/55">Each main screen shows a short explanation the first time you visit it. The Don't show me again button disables them all on this device.</p>
            <button type="button" disabled={!user?.id}
              onClick={()=>{restartPageTours(user.id);navigate('/showroom')}}
              className="mt-3 inline-flex min-h-10 items-center rounded-full border border-[#0A13E6]/30 bg-white px-4 text-[12px] font-bold text-[#0A13E6] disabled:opacity-50">
              Restart page tour
            </button>
          </div>
        </div>
      </div>
      <div className="flex flex-wrap gap-3">
        <Link to="/profile" className="inline-flex min-h-11 items-center gap-2 rounded-full border border-black/20 px-4 text-[12px] font-semibold">
          <UserRound size={16}/> Edit profile
        </Link>
        <Link to="/wallet" className="inline-flex min-h-11 items-center gap-2 rounded-full border border-black/20 px-4 text-[12px] font-semibold">
          <Wallet size={16}/> Wallet
        </Link>
      </div>
    </section>}
    {section==='notifications'&&<div>
      <p className="mb-3 text-[12px] text-black/60">Your notification inbox remains simple. Configure alerts here, including updates shown when your browser is closed.</p>
      <PushNotificationSettings/>
      <Link to="/notifications" className="text-[12px] font-bold text-[#0A13E6] underline">Open notifications inbox</Link>
    </div>}
    {section==='security'&&<section className="space-y-4 rounded-2xl border border-black/10 bg-white p-5">
      <div>
        <h2 className="text-[15px] font-black">Password and access</h2>
        <p className="mt-1 text-[12px] text-black/60">Request a secure, one-time password reset link sent to the email on your account.</p>
        <button type="button" onClick={requestReset} disabled={resetBusy||!user?.email}
          className="mt-3 inline-flex min-h-11 items-center gap-2 rounded-full bg-[#0A13E6] px-5 text-[12px] font-bold text-white disabled:opacity-40">
          <LockKeyhole size={16}/> {resetBusy?'Sending…':'Email password reset link'}
        </button>
      </div>
      <div className="border-t border-black/10 pt-4">
        <p className="text-[12px] text-black/55">Sign out of this device. Your Hats and completed deals remain on the platform.</p>
        <button type="button" onClick={signOut} disabled={signingOut}
          className="mt-3 inline-flex min-h-11 items-center gap-2 rounded-full border border-red-200 px-5 text-[12px] font-bold text-red-700">
          <LogOut size={16}/> {signingOut?'Signing out…':'Sign out'}
        </button>
      </div>
    </section>}
  </main>
}
