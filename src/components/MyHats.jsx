import { useEffect, useState } from 'react'
import { LayoutGrid, List, Paintbrush, Pencil, Trash2, Eye } from 'lucide-react'
import HatStyleDialog from './HatStyleDialog.jsx'
import MyShowroomAppeals from './MyShowroomAppeals.jsx'
import { api } from '../lib/api'
import { useAuth } from '../context/AuthContext'
import BentoCard from './BentoCard'
import HatFeedToggle from './HatFeedToggle'
import DiscoverySearch from './DiscoverySearch.jsx'
import { Link } from 'react-router-dom'
import { cldImage, cldVideoPoster } from '../lib/cloudinary'
import UserIdentity from './UserIdentity'
import { identityFromHat } from '../lib/profile.js'

export default function MyHats() {
  const { user } = useAuth()
  const [hats, setHats] = useState([])
  const [search,setSearch]=useState('')
  const [stylingHat, setStylingHat] = useState(null)
  const [hiddenShowroom, setHiddenShowroom] = useState(new Set())
  const [reviewNotes, setReviewNotes] = useState({})
  const [loading, setLoading] = useState(true)
  const [viewMode, setViewMode] = useState(() => localStorage.getItem('chombutar_viewMode') || 'grid')
  useEffect(() => {
    if (!user?.id) return
    let cancelled = false
    ;(async () => {
      try {
        const [data, visibility, reviews] = await Promise.all([
          api.getHats({ user_id: user.id }),
          api.getMyHiddenShowroomPosts().catch(() => ({hatIds: []})),
          api.getMyHatReviews().catch(() => ({reviews: []})),
        ])
        if (!cancelled) {
          setHats(data.hats || [])
          setHiddenShowroom(new Set(visibility.hatIds || []))
          setReviewNotes(Object.fromEntries((reviews.reviews || []).map(item => [item.hat_id,item])))
        }
      } catch (e) {
        console.error(e)
      } finally {
        if (!cancelled) setLoading(false)
      }
    })()
    return () => {
      cancelled = true
    }
  }, [user?.id])

  const filteredHats=hats.filter(h=>{
    const needle=search.trim().toLowerCase().replace(/^[@^]+/,'')
    return !needle || [h.hat_name,h.hat_title,h.category,h.motto,h.job_requirements,h.lga,h.role]
      .some(value=>String(value||'').toLowerCase().includes(needle))
  })

  function setMode(m) {
    setViewMode(m)
    localStorage.setItem('chombutar_viewMode', m)
  }

  function handleHatChange(patch) {
    setHats((prev) => prev.map((hat) => hat.id === patch.id ? { ...hat, ...patch } : hat))
  }

  async function restoreToShowroom(id) {
    try {
      await api.restoreOwnShowroomPost(id)
      setHiddenShowroom(previous => {
        const next = new Set(previous)
        next.delete(id)
        return next
      })
    } catch (error) {
      alert(error?.message || 'Could not restore this Showroom post.')
    }
  }

  async function setShowroomVisible(id,visible){
    try{
      if(visible)await api.restoreOwnShowroomPost(id)
      else await api.removeOwnShowroomPost(id)
      setHiddenShowroom(previous=>{
        const next=new Set(previous)
        if(visible)next.delete(id)
        else next.add(id)
        return next
      })
    }catch(error){alert(error?.message || 'Unable to update Showroom visibility.')}
  }
  function showroomControl(h){
    if(h.role!=='talent')return null
    const hidden=hiddenShowroom.has(h.id)
    const eligible=(h.media||[]).length>0
    return <button type="button" disabled={!eligible} title={!eligible?'Add approved media to this Hat before sharing it in Showroom':undefined} onClick={()=>setShowroomVisible(h.id,hidden)}
      aria-label={`${hidden?'Show':'Hide'} ${h.hat_title} ${hidden?'in':'from'} Showroom`}
      className="inline-flex min-h-10 w-full items-center justify-center gap-2 rounded-full border border-[#0A13E6]/25 bg-white px-4 text-[11px] font-bold text-[#0A13E6] disabled:opacity-50">
      <Eye size={14}/> {!eligible?'Show in Showroom · add media first':hidden?'Show in Showroom':'Hide from Showroom'}
    </button>
  }

  async function handleDelete(id) {
    if (!confirm('Delete this hat?')) return
    try {
      await api.deleteHat(id)
      setHats((prev) => prev.filter((h) => h.id !== id))
    } catch (e) {
      alert(e.message)
    }
  }

  if (loading) {
    return <p className="text-center text-black/40 py-16 text-[13px] font-medium">Loading your hats…</p>
  }

  return (
    <div className="space-y-5">
      <div className="sticky top-[57.5px] md:top-16 z-30 isolate -mx-4 px-4 py-3 flex items-center justify-between gap-3 flex-wrap border-b border-black/10 bg-[#F7F3EB]/95 backdrop-blur-lg">
        <div>
          <h1 className="text-[22px] font-bold tracking-tight">My Hats</h1>
          <p className="text-[12px] text-black/50 font-medium mt-0.5">{hats.length} hat{hats.length !== 1 ? 's' : ''}</p>
          <p className="text-[12px] text-black/50 mt-1">Choose which Hats appear in the Bento feed. Range pricing requires a fee notice confirmation.</p>
        </div>
        <DiscoverySearch value={search} onChange={setSearch} placeholder="Search My Hats…"
          label="Search your Hats" className="ml-auto w-full max-w-[min(52vw,340px)]"/>
        <div className="flex items-center gap-2">
          <div className="flex rounded-full bg-white border-[1.5px] border-black p-0.5">
            <button
              type="button"
              onClick={() => setMode('grid')}
              className={`w-9 h-9 rounded-full flex items-center justify-center transition ${
                viewMode === 'grid' ? 'bg-[#0A13E6] text-white' : 'text-black/50'
              }`}
            >
              <LayoutGrid size={16} />
            </button>
            <button
              type="button"
              onClick={() => setMode('list')}
              className={`w-9 h-9 rounded-full flex items-center justify-center transition ${
                viewMode === 'list' ? 'bg-[#0A13E6] text-white' : 'text-black/50'
              }`}
            >
              <List size={16} />
            </button>
          </div>
          <Link
            to="/create"
            className="h-10 px-5 rounded-full bg-[#0A13E6] text-white text-[13px] font-semibold border-[1.5px] border-black shadow-[0_4px_12px_rgba(10,19,230,0.25)] hover:bg-black transition flex items-center"
          >
            + New Hat
          </Link>
        </div>
      </div>

      <MyShowroomAppeals />

      {hats.length === 0 ? (
        <div className="text-center py-16 bg-white rounded-[24px] border-[1.5px] border-dashed border-black/20">
          <p className="text-black/50 mb-4 text-[13px] font-medium">You haven’t created any hats yet.</p>
          <Link
            to="/create"
            className="inline-flex h-11 px-6 rounded-full bg-[#0A13E6] text-white font-semibold text-[13px] border-[1.5px] border-black items-center"
          >
            Create your first Hat
          </Link>
        </div>
      ) : filteredHats.length === 0 ? (
        <p className="rounded-2xl border border-black/10 bg-white p-6 text-center text-[13px] font-semibold text-black/50">No Hats match your search.</p>
      ) : viewMode === 'grid' ? (
        <div className="hats-grid items-start">
          {filteredHats.map((h) => (
            <div key={h.id} className="relative group min-w-0 space-y-2">
              <div className="relative">
                <BentoCard hat={h} fullWidth onHatChange={handleHatChange} />
              </div>
              <div className="flex items-center justify-between gap-6 px-1" aria-label={`Manage ${h.hat_title}`}>
                <Link to={`/create?edit=${h.id}`} aria-label={`Edit ${h.hat_title}`}
                  className="inline-flex min-h-11 items-center gap-2 rounded-full border border-black/15 bg-white px-4 text-[12px] font-bold hover:border-[#0A13E6]">
                  <Pencil size={15} /> Edit Hat
                </Link>
                <button type="button" onClick={() => handleDelete(h.id)} aria-label={`Delete ${h.hat_title}`}
                  className="inline-flex min-h-11 items-center gap-2 rounded-full border border-red-200 bg-white px-4 text-[12px] font-bold text-red-700 hover:bg-red-50">
                  <Trash2 size={15} /> Delete
                </button>
              </div>
              {reviewNotes[h.id]?.decision === 'needs_changes' && (
                <div role="status" className="rounded-xl border border-amber-200 bg-amber-50 p-3 text-[11px] text-amber-900">
                  <strong className="block">Hat data review: changes requested</strong>
                  <p className="mt-1 break-words">{reviewNotes[h.id].note}</p>
                  <Link to={`/create?edit=${h.id}`} className="mt-2 inline-block font-bold underline">Update Hat information</Link>
                </div>
              )}
              {showroomControl(h)}
              <button type="button" onClick={() => setStylingHat(h)}
                className="inline-flex min-h-10 w-full items-center justify-center gap-2 rounded-full border border-black/20 bg-white px-4 text-[11px] font-bold hover:border-black">
                <Paintbrush size={14} aria-hidden="true"/> Customize appearance
              </button>
              <HatFeedToggle hat={h} onChange={handleHatChange} />
                {(h.media || []).some(m => ['pending','processing','held','rejected'].includes(m.screening_status)) && (
                  <p className="px-2 text-[11px] font-semibold text-amber-700" role="status">
                    {h.media.some(m => ['held','rejected'].includes(m.screening_status))
                      ? 'Media requires review. Replace the media or request an appeal.'
                      : 'Media screening is underway; Showroom discovery is paused.'}
                  </p>
                )}
            </div>
          ))}
        </div>
      ) : (
        <ul className="bg-white rounded-[20px] border-[1.5px] border-black divide-y divide-black/10 overflow-hidden">
          {filteredHats.map((h) => (
            <li key={h.id} className="hover:bg-[#F5F3EF]/50 transition">
              <div className="flex flex-wrap items-center gap-3 sm:gap-4 p-4">
                <div className="w-12 h-12 rounded-[12px] bg-[#F5F3EF] overflow-hidden shrink-0 border-[1.5px] border-black/10">
                  {h.media?.[0]?.url &&
                    (h.media[0].type === 'video' ? (
                      <img src={cldVideoPoster(h.media[0].url, { w: 96, h: 96 })} alt="" className="w-full h-full object-cover" />
                    ) : (
                      <img src={cldImage(h.media[0].url, { w: 96, h: 96 })} alt="" className="w-full h-full object-cover" />
                    ))}
                </div>
                <div className="min-w-0 flex-1">
                  <p className="font-semibold text-[14px] truncate">{h.hat_title}</p>
                  <p className="text-[12px] text-black/50">
                    <UserIdentity user={identityFromHat(h)} layout="inline" showAvatar={false} nameClassName="font-semibold text-black/70" usernameClassName="font-semibold text-black/50" /> · {h.category} · {h.role}
                  </p>
                </div>
                <span className="text-[13px] font-bold">
                  ₦{(h.price_type === 'range' ? h.price_min : h.rate || 0).toLocaleString()}
                </span>
                <button type="button" onClick={() => setStylingHat(h)} aria-label="Customize Hat appearance"
                  className="inline-flex h-9 w-9 items-center justify-center rounded-full border border-black/15 text-black/60 hover:border-black hover:text-black">
                  <Paintbrush size={14}/>
                </button>
                <Link
                  to={`/create?edit=${h.id}`}
                  aria-label={`Edit ${h.hat_title}`}
                  className="w-10 h-10 rounded-full border-[1.5px] border-black/10 flex items-center justify-center text-black/50 hover:border-black hover:text-black transition"
                >
                  <Pencil size={14} />
                </Link>

              </div>
              <div className="px-4 pb-4">
                <div className="mb-3 flex justify-end border-t border-black/10 pt-3">
                  <button type="button" onClick={() => handleDelete(h.id)}
                    aria-label={`Delete ${h.hat_title}`}
                    className="inline-flex min-h-10 items-center gap-2 rounded-full border border-red-200 px-4 text-[12px] font-bold text-red-700 hover:bg-red-50">
                    <Trash2 size={14}/> Delete Hat
                  </button>
                </div>
                {reviewNotes[h.id]?.decision === 'needs_changes' && (
                  <div role="status" className="mb-3 rounded-xl border border-amber-200 bg-amber-50 p-3 text-[11px] text-amber-900">
                    <strong className="block">Changes requested for this Hat</strong>
                    <p className="mt-1 break-words">{reviewNotes[h.id].note}</p>
                    <Link to={`/create?edit=${h.id}`} className="mt-2 inline-block font-bold underline">Update Hat</Link>
                  </div>
                )}
                {showroomControl(h)}
                <HatFeedToggle hat={h} onChange={handleHatChange} />
                {(h.media || []).some(m => ['pending','processing','held','rejected'].includes(m.screening_status)) && (
                  <p className="px-2 text-[11px] font-semibold text-amber-700" role="status">
                    {h.media.some(m => ['held','rejected'].includes(m.screening_status))
                      ? 'Media requires review. Replace the media or request an appeal.'
                      : 'Media screening is underway; Showroom discovery is paused.'}
                  </p>
                )}
              </div>
            </li>
          ))}
        </ul>
      )}
      <HatStyleDialog key={stylingHat?.id || 'none'} hat={stylingHat}
        onClose={() => setStylingHat(null)}
        onSaved={(patch) => { handleHatChange(patch); setStylingHat(null) }} />
    </div>
  )
}
