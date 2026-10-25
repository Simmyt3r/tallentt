import { useEffect, useState } from 'react'
import { Link,useNavigate } from 'react-router-dom'
import { Radio, Trophy, Users } from 'lucide-react'
import CompactPageHeader from '../../components/CompactPageHeader.jsx'
import { api } from '../../lib/api.js'
import { useAuth } from '../../context/AuthContext.jsx'

const CATEGORIES=['Music','Dance','Comedy','Fashion','Acting','Modeling','Art & Design','Content Creation','Sports','Other']
export default function StageCompetitions() {
  const {user}=useAuth()
  const navigate=useNavigate()
  const [items,setItems]=useState([])
  const [search,setSearch]=useState('')
  const [loading,setLoading]=useState(true)
  const [error,setError]=useState('')
  const [creating,setCreating]=useState(false)
  const [form,setForm]=useState({title:'',category:'Music',description:'',max_contestants:4})
  const canHost=['talent','dual'].includes(user?.role)
  const searchTerm=search.trim().toLowerCase()
  const visibleItems=items.filter(item=>[item.title,item.description,item.host_username,item.category,item.status].some(value=>String(value??'').toLowerCase().includes(searchTerm)))
  async function refresh(){
    try{const result=await api.getStageCompetitions();setItems(result.competitions||[]);setError('')}
    catch(err){setError(err.message||'Stage Competitions are unavailable.')}
    finally{setLoading(false)}
  }
  useEffect(()=>{refresh()},[])
  async function create(event) {
    event.preventDefault()
    if(creating)return
    setCreating(true);setError('')
    try{
      const result=await api.stageAction({action:'stage_create',...form})
      navigate('/live/competitions/'+result.id)
    }catch(err){setError(err.message||'Could not create competition.')}
    finally{setCreating(false)}
  }
  return <main className="mx-auto max-w-[900px] space-y-5 pb-10">
    <CompactPageHeader title="Stage Competitions" icon={Trophy} searchValue={search} onSearchChange={setSearch}
      searchPlaceholder="Search competitions…" searchLabel="Search Stage competitions by title, host or category"/>
    <Link to="/live" className="inline-flex text-[11px] font-semibold text-[#0A13E6]">← Live broadcasts</Link>
    {canHost&&<form onSubmit={create} className="space-y-3 rounded-2xl border border-black/10 bg-white p-5">
      <h2 className="text-[15px] font-black">Host a Stage competition</h2>
      <label className="block space-y-1 text-[12px] font-bold">Title
        <input required minLength={5} maxLength={120} placeholder="Friday Music Showdown"
          value={form.title} onChange={event=>setForm({...form,title:event.target.value})}
          className="mt-1 h-11 w-full rounded-xl border border-black/20 px-3 font-normal"/>
      </label>
      <div className="grid gap-3 sm:grid-cols-2">
        <label className="text-[12px] font-bold">Category
          <select value={form.category} onChange={event=>setForm({...form,category:event.target.value})}
            className="mt-1 h-11 w-full rounded-xl border border-black/20 bg-white px-3">
            {CATEGORIES.map(item=><option key={item}>{item}</option>)}
          </select>
        </label>
        <label className="text-[12px] font-bold">Contestants
          <select value={form.max_contestants} onChange={event=>setForm({...form,max_contestants:Number(event.target.value)})}
            className="mt-1 h-11 w-full rounded-xl border border-black/20 bg-white px-3">
            {[2,3,4,5,6].map(item=><option key={item}>{item}</option>)}
          </select>
        </label>
      </div>
      <label className="block space-y-1 text-[12px] font-bold">Rules and instructions (optional)
        <textarea maxLength={500} rows={2} value={form.description}
          onChange={event=>setForm({...form,description:event.target.value})}
          className="mt-1 w-full rounded-xl border border-black/20 px-3 py-2 font-normal"/>
      </label>
      <button type="submit" disabled={creating||form.title.trim().length<5}
        className="min-h-11 rounded-full bg-[#0A13E6] px-5 text-[12px] font-bold text-white disabled:opacity-40">
        {creating?'Creating…':'Create Stage competition'}
      </button>
    </form>}
    <section className="space-y-3">
      <div className="flex items-center justify-between">
        <h2 className="text-[15px] font-black">Stage competitions</h2>
        <button type="button" onClick={()=>{setLoading(true);refresh()}}
          className="min-h-10 rounded-full border border-black/20 bg-white px-4 text-[12px] font-bold">Refresh</button>
      </div>
      {error&&<p role="alert" className="rounded-xl bg-red-50 p-4 text-[12px] text-red-700">{error}</p>}
      {loading&&<p role="status" className="py-6 text-[12px] text-black/50">Loading Stage competitions…</p>}
      {!loading&&!error&&!visibleItems.length&&<p className="rounded-xl border border-black/10 bg-white p-6 text-[12px] text-black/50">{searchTerm?'No matching Stage competitions.':'No Stage competitions yet.'}</p>}
      <div className="grid gap-3 sm:grid-cols-2">
        {visibleItems.map(item=><Link key={item.id} to={'/live/competitions/'+item.id}
          className="block space-y-3 rounded-2xl border border-black/10 bg-white p-4 hover:border-[#0A13E6]">
          <div className="flex items-center justify-between gap-2">
            <span className="text-[11px] font-bold text-black/50">{item.category}</span>
            <span className={`rounded-full px-3 py-1 text-[10px] font-bold ${
              item.status==='live'?'bg-red-100 text-red-700':
              item.status==='registration'?'bg-blue-50 text-blue-700':'bg-black/5'}`}>
              {item.status==='live'?'LIVE':item.status==='registration'?'Registration open':'Completed'}
            </span>
          </div>
          <h3 className="text-[16px] font-black">{item.title}</h3>
          <p className="line-clamp-2 text-[12px] text-black/55">{item.description||'Talents compete live. Audience votes decide the leaderboard.'}</p>
          <div className="flex items-center gap-4 text-[11px] font-semibold text-black/60">
            <span className="flex items-center gap-1"><Users size={13}/>{item.participants}/{item.max_contestants} talents</span>
            <span className="flex items-center gap-1"><Radio size={13}/>{item.votes} votes</span>
          </div>
          <p className="text-[11px] text-black/50">Hosted by @{item.host_username}</p>
        </Link>)}
      </div>
    </section>
  </main>
}
