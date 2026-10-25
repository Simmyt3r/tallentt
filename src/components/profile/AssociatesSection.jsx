import { useState } from 'react'
import { Link } from 'react-router-dom'
import { cldImage } from '../../lib/cloudinary.js'
import { api } from '../../lib/api.js'
import { useAccountOrbit } from '../../lib/useAccountOrbit.js'

function AssociateOrbit({username}) {
  const {node,score,resolved}=useAccountOrbit(username)
  return <span ref={node}>Orbit {score===null?(resolved?'—':'…'):score}/100</span>
}

export default function AssociatesSection({ data, isOwner, onRefresh }) {
  const [busy, setBusy] = useState('')
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  if (!data) return <p role="status" className="text-[12px] text-black/55">Associate details are not available until the Associates migration is applied.</p>
  async function act(action, other_id) {
    if (busy) return
    setBusy(action+other_id);setError('');setNotice('')
    try {
      await api.associateAction({ action, other_id })
      setNotice('Your professional network has been updated.')
      await onRefresh()
    } catch (e) { setError(e.message || 'Could not update this connection.') }
    finally { setBusy('') }
  }
  const relation=data.relation
  const other=data.user_id
  const accepted=relation?.status==='accepted'
  return <section className="space-y-4" aria-label="Associates and subscribers">
    <div className="rounded-2xl border border-black/10 bg-white p-4">
      <h2 className="text-[15px] font-black">Professional Associates</h2>
      <p className="mt-1 text-[12px] text-black/55">
        Mutual invitations require acceptance. Subscribers follow posts without requiring approval.
        A vouch is another person's opinion, not identity verification or proof of completed work.
      </p>
      {!isOwner && <div className="mt-3 flex flex-wrap gap-2">
        <button type="button" disabled={Boolean(busy)} onClick={()=>act(data.following?'associate_unfollow':'associate_follow',other)}
          className="min-h-10 rounded-full border border-[#0A13E6] px-4 text-[12px] font-bold text-[#0A13E6] disabled:opacity-50">
          {data.following?'Unsubscribe':'Subscribe to Hits & Vibes'}
        </button>
        {!relation || ['removed','declined'].includes(relation.status)
          ? <button type="button" disabled={Boolean(busy)} onClick={()=>act('associate_request',other)}
            className="min-h-10 rounded-full bg-[#0A13E6] px-4 text-[12px] font-bold text-white disabled:opacity-50">Request Associate</button>
          : null}
        {relation?.outgoing && <span className="rounded-full bg-amber-50 px-3 py-2 text-[12px] font-bold text-amber-900">Request awaiting approval</span>}
        {relation?.incoming && <><button type="button" disabled={Boolean(busy)} onClick={()=>act('associate_accept',other)}
          className="min-h-10 rounded-full bg-[#0A13E6] px-4 text-[12px] font-bold text-white disabled:opacity-50">Accept Associate</button>
          <button type="button" disabled={Boolean(busy)} onClick={()=>act('associate_decline',other)}
            className="min-h-10 rounded-full border border-black/20 px-4 text-[12px] font-bold disabled:opacity-50">Decline</button></>}
        {accepted && <><button type="button" disabled={Boolean(busy)}
          onClick={()=>act(relation.vouched_by_me?'associate_unvouch':'associate_vouch',other)}
          className="min-h-10 rounded-full border border-blue-300 px-4 text-[12px] font-bold text-[#0A13E6] disabled:opacity-50">
          {relation.vouched_by_me?'Remove vouch':'Vouch for this Associate'}
        </button>
          <button type="button" disabled={Boolean(busy)} onClick={()=>act('associate_remove',other)}
            className="min-h-10 rounded-full border border-red-200 px-4 text-[12px] font-bold text-red-700 disabled:opacity-50">Remove Associate</button></>}
      </div>}
      {error&&<p role="alert" className="mt-3 text-[12px] text-red-700">{error}</p>}
      {notice&&<p role="status" className="mt-3 text-[12px] text-green-700">{notice}</p>}
    </div>
    {isOwner&&data.incoming?.length>0&&<div className="rounded-2xl border border-black/10 bg-white p-4">
      <h3 className="mb-3 text-[13px] font-black">Associate requests ({data.incoming.length})</h3>
      <div className="space-y-2">{data.incoming.map(person=><div key={person.id} className="flex flex-wrap items-center gap-2 rounded-xl bg-[#F7F3EB] p-3">
        <Link className="min-w-0 flex-1 truncate text-[12px] font-bold" to={'/profile/'+encodeURIComponent(person.username)}>
          {person.full_name||'^'+person.username}</Link>
        <button disabled={Boolean(busy)} onClick={()=>act('associate_accept',person.requester_id)} className="rounded-full bg-[#0A13E6] px-3 py-2 text-[11px] font-bold text-white">Accept</button>
        <button disabled={Boolean(busy)} onClick={()=>act('associate_decline',person.requester_id)} className="rounded-full border border-black/15 px-3 py-2 text-[11px] font-bold">Decline</button>
      </div>)}</div>
    </div>}
    <div className="rounded-2xl border border-black/10 bg-white p-4">
      <h3 className="text-[14px] font-black">Accepted Associates</h3>
      {!data.associates?.length&&<p className="mt-3 text-[12px] text-black/55">No Associates yet. Professional connections begin with an invitation.</p>}
      <div className="mt-3 divide-y divide-black/10">
        {(data.associates||[]).map(person=><div key={person.id} className="flex items-center gap-3 py-3">
          <Link to={'/profile/'+encodeURIComponent(person.username)} className="shrink-0">
            {person.avatar_url?<img alt="" src={cldImage(person.avatar_url,{w:96,h:96})} className="h-11 w-11 rounded-full object-cover"/>
              :<span className="grid h-11 w-11 place-items-center rounded-full bg-black/10 text-[12px] font-bold">{(person.full_name||person.username||'?').slice(0,1)}</span>}
          </Link>
          <div className="min-w-0 flex-1">
            <Link to={'/profile/'+encodeURIComponent(person.username)} className="block truncate text-[12px] font-bold hover:underline">{person.full_name||person.username}</Link>
            <p className="truncate text-[11px] text-black/55">^{person.username} · {(person.skills||[]).slice(0,2).join(', ')||person.headline||'Professional subscriber'}</p>
            <p className="text-[10px] text-black/45">
              <AssociateOrbit username={person.username}/> · Associated since {person.accepted_at?new Date(person.accepted_at).toLocaleDateString('en-NG'):'—'}
              {person.received_vouch?' · Vouched':''}
            </p>
          </div>
          {isOwner&&<button type="button" disabled={Boolean(busy)} onClick={()=>act(person.gave_vouch?'associate_unvouch':'associate_vouch',person.peer_id)}
            className="min-h-10 shrink-0 rounded-full border border-blue-200 px-3 text-[11px] font-bold text-[#0A13E6] disabled:opacity-40">
            {person.gave_vouch?'Vouched':'Vouch'}
          </button>}
        </div>)}
      </div>
    </div>
  </section>
}
