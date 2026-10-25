import { useCallback,useEffect,useRef,useState } from 'react'
import { Link,useParams } from 'react-router-dom'
import Hls from 'hls.js'
import { Radio,Trophy,Users,Wifi } from 'lucide-react'
import { api } from '../../lib/api.js'
import { useAuth } from '../../context/AuthContext.jsx'
import UserIdentity from '../../components/UserIdentity.jsx'
import CompactPageHeader from '../../components/CompactPageHeader.jsx'

function LiveVideo({src,quality}){
  const ref=useRef(null)
  const [error,setError]=useState('')
  useEffect(()=>{
    const el=ref.current
    if(!el||!src)return undefined
    let hls
    if(Hls.isSupported()){
      hls=new Hls({enableWorker:true,lowLatencyMode:true,backBufferLength:10})
      hls.attachMedia(el)
      hls.on(Hls.Events.MEDIA_ATTACHED,()=>hls.loadSource(src))
      hls.on(Hls.Events.MANIFEST_PARSED,()=>{
        if(quality==='data_saver'&&hls.levels?.length){
          const index=hls.levels.map((level,i)=>({i,bitrate:level.bitrate||0,height:level.height||0}))
            .sort((a,b)=>(a.height||a.bitrate)-(b.height||b.bitrate))[0]?.i||0
          hls.autoLevelCapping=index
        }
        el.play().catch(()=>{})
      })
      hls.on(Hls.Events.ERROR,(_event,data)=>{
        if(data.fatal)setError('Stream temporarily unavailable. Open the full Live room to reconnect.')
      })
    }else if(el.canPlayType('application/vnd.apple.mpegurl')){
      el.src=src
      el.play().catch(()=>{})
    }else setError('HLS video is not supported in this browser.')
    return ()=>{
      hls?.destroy()
      el.pause()
      el.removeAttribute('src')
      el.load()
    }
  },[src,quality])
  return <div className="relative aspect-video bg-black">
    <video ref={ref} controls playsInline muted autoPlay className="h-full w-full object-contain"/>
    {error&&<p role="alert" className="absolute inset-x-3 bottom-3 rounded-xl bg-black/80 p-3 text-[11px] text-white">{error}</p>}
  </div>
}

export default function StageCompetitionRoom(){
  const {id}=useParams()
  const {user}=useAuth()
  const [data,setData]=useState(null)
  const [streams,setStreams]=useState([])
  const [selectedStream,setSelectedStream]=useState('')
  const [quality,setQuality]=useState('data_saver')
  const [loading,setLoading]=useState(true)
  const [busy,setBusy]=useState(false)
  const [error,setError]=useState('')
  const [notice,setNotice]=useState('')
  const [playId,setPlayId]=useState('')
  const load=useCallback(async()=>{
    try{
      const result=await api.getStageCompetition(id)
      setData(result)
      setError('')
    }catch(err){setError(err.message||'Could not load Stage competition.')}
    finally{setLoading(false)}
  },[id])
  useEffect(()=>{
    load()
    const interval=setInterval(load,12000)
    return()=>clearInterval(interval)
  },[load])
  useEffect(()=>{
    let canceled=false
    api.getMyCompetitionStreams().then(result=>{
      if(!canceled)setStreams(result.streams||[])
    }).catch(()=>{})
    return()=>{canceled=true}
  },[user?.id])

  async function action(payload){
    if(busy)return
    setBusy(true);setError('');setNotice('')
    try {
      await api.stageAction({competition_id:id,...payload})
      setNotice(payload.action==='stage_vote'?'Your vote was recorded. You cannot vote twice.':
        payload.action==='stage_join'?'You have entered this competition.':'Stage competition updated.')
      await load()
    }catch(err){setError(err.message||'Stage action could not be completed.')}
    finally{setBusy(false)}
  }

  if(loading&&!data)return <><CompactPageHeader title="Stage Competition"/><p className="py-12 text-center text-[12px] text-black/50">Loading Stage competition…</p></>
  if(!data)return <main className="mx-auto max-w-[900px] space-y-3 pb-8">
    <CompactPageHeader title="Stage Competition"/>
    <Link to="/live/competitions" className="text-[12px] font-bold text-[#0A13E6]">← Stage Competitions</Link>
    <p role="alert" className="rounded-xl bg-red-50 p-4 text-[12px] text-red-700">{error||'Competition unavailable.'}</p>
  </main>
  const {competition:contest,entrants,is_host,is_entrant,voted_for}=data
  const active=entrants.find(item=>item.stream_id===playId)
  const canJoin=!is_host&&!is_entrant&&['talent','dual'].includes(user?.role)&&contest.status==='registration'
  const canVote=contest.status==='live'&&!is_host&&!is_entrant&&!voted_for
  return <main className="mx-auto max-w-[1000px] space-y-5 pb-12">
    <CompactPageHeader title={contest.title || 'Stage Competition'} icon={Trophy}/>
    <Link to="/live/competitions" className="inline-flex min-h-9 items-center text-[11px] font-bold text-[#0A13E6]">← All Stage Competitions</Link>
    <header className="space-y-3 rounded-2xl border border-black/10 bg-white p-4">
      <div className="flex flex-wrap items-center justify-end gap-3">
        <span className="rounded-full bg-[#EEF0FF] px-3 py-2 text-[11px] font-bold">{contest.status.toUpperCase()}</span>
      </div>
      <p className="text-[12px] text-black/60">{contest.description||'Watch contestants compete and support them with a single audience vote.'}</p>
      <div className="flex flex-wrap gap-4 text-[11px] font-bold text-black/55">
        <span>{contest.category}</span>
        <span className="flex items-center gap-1"><Users size={13}/>{entrants.length}/{contest.max_contestants} contestants</span>
        <span>Hosted by @{contest.host_username}</span>
      </div>
      <p className="text-[11px] text-black/55">Votes determine the leaderboard only. Wallet balances, escrow and payouts are not affected.</p>
      {is_host&&contest.status==='registration'&&
        <button type="button" onClick={()=>action({action:'stage_start'})} disabled={busy||entrants.length<2}
          className="min-h-10 rounded-full bg-[#0A13E6] px-5 text-[12px] font-bold text-white disabled:opacity-40">
          Start competition (minimum two active streams)
        </button>}
      {is_host&&contest.status==='live'&&
        <button type="button" onClick={()=>{if(window.confirm('Finish this competition and close voting?'))action({action:'stage_complete'})}}
          disabled={busy} className="min-h-10 rounded-full bg-black px-5 text-[12px] font-bold text-white disabled:opacity-40">Complete competition</button>}
      {is_host&&contest.status==='registration'&&
        <button type="button" onClick={()=>{if(window.confirm('Cancel this competition?'))action({action:'stage_cancel'})}}
          disabled={busy} className="min-h-10 rounded-full border border-red-300 px-4 text-[12px] font-bold text-red-700">Cancel competition</button>}
      {canJoin&&<div className="space-y-2 rounded-xl border border-black/10 bg-[#F7F3EB] p-4">
        <h2 className="text-[13px] font-black">Join with your own Live stream</h2>
        <p className="text-[11px] text-black/60">Start broadcasting through ChombuTar Live first, then select your active stream. A fallback camera preview is not eligible.</p>
        <div className="flex flex-wrap gap-2">
          <select aria-label="Your active Live stream" value={selectedStream} onChange={event=>setSelectedStream(event.target.value)}
            className="min-h-11 flex-1 rounded-xl border border-black/20 bg-white px-3 text-[12px]">
            <option value="">Select an active public stream</option>
            {streams.map(stream=><option key={stream.id} value={stream.id}>{stream.title}</option>)}
          </select>
          <button type="button" disabled={busy||!selectedStream}
            onClick={()=>action({action:'stage_join',stream_id:selectedStream})}
            className="min-h-11 rounded-full bg-[#0A13E6] px-4 text-[12px] font-bold text-white disabled:opacity-40">Join Stage</button>
        </div>
        {!streams.length&&<Link to="/live" className="text-[12px] font-bold text-[#0A13E6] underline">Start your Live broadcast</Link>}
      </div>}
    </header>
    {notice&&<p role="status" className="rounded-xl bg-blue-50 p-3 text-[12px]">{notice}</p>}
    {error&&<p role="alert" className="rounded-xl bg-red-50 p-3 text-[12px] text-red-700">{error}</p>}
    <section className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="text-[16px] font-black">Competition stage & leaderboard</h2>
        <label className="text-[11px] font-bold text-black/60">Playback quality
          <select value={quality} onChange={event=>setQuality(event.target.value)}
            className="ml-2 min-h-9 rounded-xl border border-black/20 bg-white px-2">
            <option value="data_saver">Data Saver</option><option value="auto">Auto</option>
          </select>
        </label>
      </div>
      {contest.status==='registration'&&<p className="rounded-xl border border-black/10 bg-white p-4 text-[12px] text-black/50">Contestants are joining. The host starts the round when at least two public Live streams are connected.</p>}
      {!entrants.length&&<p className="rounded-xl border border-black/10 bg-white p-8 text-center text-[12px] text-black/50">No contestants have joined yet.</p>}
      <div className="grid gap-4 sm:grid-cols-2">
        {entrants.map((entrant,index)=><article key={entrant.talent_id}
          className="overflow-hidden rounded-2xl border border-black/10 bg-white">
          {active?.stream_id===entrant.stream_id&&entrant.hls_url&&contest.status==='live'
            ? <LiveVideo src={entrant.hls_url} quality={quality}/>
            : <div className="flex aspect-video flex-col items-center justify-center gap-2 bg-[#101525] p-3 text-center text-white">
              <Radio size={24}/>
              <span className="text-[12px] font-bold">{entrant.stream_status==='live'?'Stream available':'Stream offline'}</span>
              {entrant.hls_url&&contest.status==='live'&&
                <button type="button" onClick={()=>setPlayId(entrant.stream_id)}
                  className="min-h-10 rounded-full border border-white/30 bg-white px-5 text-[12px] font-bold text-black">
                  Watch this contestant
                </button>}
            </div>}
          <div className="space-y-3 p-4">
            <div className="flex items-center justify-between gap-2">
              <UserIdentity user={entrant} />
              <span className="text-[13px] font-black">#{index+1}</span>
            </div>
            <p className="text-[12px] text-black/60">{entrant.live_title}</p>
            <div className="flex items-center justify-between gap-2">
              <span className="text-[13px] font-black">{entrant.votes} {Number(entrant.votes)===1?'vote':'votes'}</span>
              <div className="flex gap-2">
                <Link to={'/live/stage/'+entrant.stream_id}
                  className="inline-flex min-h-10 items-center rounded-full border border-black/20 px-3 text-[11px] font-bold">Full Live</Link>
                {canVote&&<button type="button" disabled={busy}
                  onClick={()=>action({action:'stage_vote',talent_id:entrant.talent_id})}
                  className="min-h-10 rounded-full bg-[#0A13E6] px-4 text-[11px] font-bold text-white disabled:opacity-40">Vote</button>}
                {voted_for===entrant.talent_id&&<span className="inline-flex items-center rounded-full bg-blue-50 px-3 text-[11px] font-bold text-blue-700">Your vote</span>}
              </div>
            </div>
          </div>
        </article>)}
      </div>
      {contest.status==='completed'&&entrants.length>0&&<p className="rounded-xl border border-black/10 bg-white p-4 text-[12px] font-bold">
        Final leaderboard recorded. Highest audience votes: {entrants[0].full_name||entrants[0].username}
        {Number(entrants[0].votes)===Number(entrants[1]?.votes)&&' (tied)'}.
      </p>}
    </section>
    <p className="flex items-center gap-2 text-[11px] text-black/40"><Wifi size={13}/> Only one video is played at a time to reduce data use. Competition updates refresh periodically.</p>
  </main>
}
