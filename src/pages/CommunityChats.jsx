import { useEffect, useRef, useState } from 'react'
import { ArrowLeft, Send, Search } from 'lucide-react'
import { api } from '../lib/api.js'
import { useAuth } from '../context/AuthContext.jsx'

export function AssociateThread({ id, onBack, onChange = () => {} }) {
  const { user } = useAuth()
  const [data, setData] = useState(null),
    [text, setText] = useState(''),
    [reply, setReply] = useState(null)
  const [busy, setBusy] = useState(false),
    [error, setError] = useState('')
  const scroll = useRef(null),
    alive = useRef(true),
    sequence = useRef(0)
  useEffect(() => {
    alive.current = true
    return () => {
      alive.current = false
    }
  }, [])
  async function load() {
    const request = ++sequence.current
    const next = await api.getCommunityThread(id)
    if (!alive.current || request !== sequence.current) return
    const el = scroll.current,
      atBottom = !el || el.scrollHeight - el.scrollTop - el.clientHeight < 100
    setData(next)
    if (atBottom)
      requestAnimationFrame(() => {
        if (scroll.current)
          scroll.current.scrollTop = scroll.current.scrollHeight
      })
    const last = next.messages.at(-1)
    if (
      last &&
      atBottom &&
      !document.hidden &&
      next.messages.some((m) => m.sender_id !== user?.id && !m.read_at)
    ) {
      await api.communityChatAction({
        action: 'community_read',
        thread_id: id,
        through_id: last.id,
      })
      window.dispatchEvent(new Event('inbox:read'))
    }
  }
  useEffect(() => {
    let stopped = false,
      timer
    const poll = async () => {
      try {
        if (!document.hidden) await load()
      } catch (e) {
        if (!stopped) setError(e.message)
      } finally {
        if (!stopped) timer = setTimeout(poll, 8000)
      }
    }
    poll()
    return () => {
      stopped = true
      clearTimeout(timer)
    }
  }, [id])
  async function act(payload) {
    if (busy) return
    setBusy(true)
    setError('')
    try {
      await api.communityChatAction({ thread_id: id, ...payload })
      if (!alive.current) return
      if (payload.action === 'community_send') {
        setText('')
        setReply(null)
        if (scroll.current)
          scroll.current.scrollTop = scroll.current.scrollHeight
      }
      await load()
      onChange()
    } catch (e) {
      if (alive.current) setError(e.message)
    } finally {
      if (alive.current) setBusy(false)
    }
  }
  const thread = data?.thread,
    accepted = thread?.status === 'accepted'
  return (
    <section
      className="flex h-full min-h-0 min-w-0 flex-col bg-white"
      aria-label="Associate conversation"
    >
      <header className="flex items-center gap-3 border-b border-black/10 p-4">
        <button
          type="button"
          onClick={onBack}
          aria-label="Back to conversations"
          className="md:hidden"
        >
          <ArrowLeft size={20} />
        </button>
        <div className="min-w-0 flex-1">
          <h2 className="truncate text-sm font-bold">
            {thread?.peer_name ||
              thread?.peer_username ||
              'Loading conversation…'}
          </h2>
          <p className="text-xs text-black/45">
            Associate ·{' '}
            {thread?.status === 'pending'
              ? 'Chat request'
              : thread?.status || 'Private conversation'}
          </p>
        </div>
        {accepted && (
          <button
            type="button"
            disabled={busy}
            className="rounded-full border px-3 py-2 text-xs text-red-600"
            onClick={() => {
              if (window.confirm('Block this associate and stop messaging?'))
                act({ action: 'community_respond', decision: 'blocked' })
            }}
          >
            Block
          </button>
        )}
      </header>
      {error && (
        <div
          role="alert"
          className="m-3 rounded-xl bg-red-50 p-3 text-xs text-red-700"
        >
          {error}{' '}
          <button
            type="button"
            onClick={() =>
              load()
                .then(() => setError(''))
                .catch((e) => setError(e.message))
            }
            className="underline"
          >
            Retry
          </button>
        </div>
      )}
      <div
        ref={scroll}
        className="min-h-0 flex-1 space-y-3 overflow-y-auto bg-[#FAFAF8] p-4"
        role="region"
        aria-label="Message history"
      >
        {data?.messages.map((m) => {
          const own = m.sender_id === user?.id
          return (
            <article
              key={m.id}
              className={`w-fit max-w-[85%] rounded-2xl px-4 py-2.5 text-sm ${own ? 'ml-auto bg-[#0A13E6] text-white' : 'border border-black/5 bg-white'}`}
            >
              {m.reply_body && (
                <blockquote className="mb-2 whitespace-pre-wrap break-words [overflow-wrap:anywhere] border-l-2 border-current/30 pl-2 text-xs opacity-75">
                  <strong className="block">
                    {m.reply_sender_id === user?.id
                      ? 'You'
                      : thread.peer_name || thread.peer_username}
                  </strong>
                  {m.reply_body}
                </blockquote>
              )}
              <p className="whitespace-pre-wrap break-words [overflow-wrap:anywhere]">
                {m.body}
              </p>
              <time
                dateTime={m.created_at}
                className="mt-1 block text-[10px] opacity-60"
              >
                {new Date(m.created_at).toLocaleString([], {
                  month: 'short',
                  day: 'numeric',
                  hour: '2-digit',
                  minute: '2-digit',
                })}
              </time>
              <div className="mt-1 flex items-center justify-between gap-4 text-[10px]">
                {accepted && (
                  <button
                    type="button"
                    className="py-1 underline underline-offset-2"
                    aria-label={`Reply to ${m.body}`}
                    onClick={() => {
                      setReply(m)
                      document.getElementById('associate-message')?.focus()
                    }}
                  >
                    Reply
                  </button>
                )}
                {own && (
                  <span
                    title={
                      m.read_at
                        ? new Date(m.read_at).toLocaleString()
                        : undefined
                    }
                  >
                    {m.read_at ? 'Seen' : 'Sent'}
                  </span>
                )}
              </div>
            </article>
          )
        })}
      </div>
      {thread?.status === 'pending' && thread.recipient_id === user?.id && (
        <div className="flex gap-2 border-t p-3">
          {['accepted', 'declined', 'blocked'].map((decision, i) => (
            <button
              key={decision}
              type="button"
              disabled={busy}
              onClick={() => act({ action: 'community_respond', decision })}
              className="rounded-full border px-4 py-2 text-xs font-semibold"
            >
              {['Accept chat', 'Decline', 'Block'][i]}
            </button>
          ))}
        </div>
      )}
      {accepted ? (
        <form
          onSubmit={(e) => {
            e.preventDefault()
            if (text.trim())
              act({
                action: 'community_send',
                text,
                reply_to_id: reply?.id || null,
              })
          }}
          className="border-t border-black/10 p-3"
        >
          {reply && (
            <div className="mb-2 flex items-center gap-2 rounded-xl bg-blue-50 p-3 text-xs">
              <div className="min-w-0 flex-1">
                <strong>
                  Replying to{' '}
                  {reply.sender_id === user?.id
                    ? 'yourself'
                    : thread.peer_name || thread.peer_username}
                </strong>
                <p className="truncate">{reply.body}</p>
              </div>
              <button
                type="button"
                aria-label="Cancel reply"
                onClick={() => setReply(null)}
              >
                Cancel
              </button>
            </div>
          )}
          <div className="flex items-end gap-2">
            <label className="sr-only" htmlFor="associate-message">
              Message
            </label>
            <textarea
              id="associate-message"
              rows={1}
              maxLength={2000}
              disabled={busy}
              value={text}
              onChange={(e) => setText(e.target.value)}
              onKeyDown={(e) => {
                if (
                  e.key === 'Enter' &&
                  !e.shiftKey &&
                  !e.nativeEvent.isComposing
                ) {
                  e.preventDefault()
                  e.currentTarget.form.requestSubmit()
                }
              }}
              placeholder="Type a message…"
              className="min-h-11 min-w-0 flex-1 resize-none rounded-3xl border bg-[#FCFBF8] px-4 py-3 text-sm"
            />
            <button
              type="submit"
              aria-label="Send message"
              disabled={busy || !text.trim()}
              className="grid h-11 w-11 place-items-center rounded-full bg-[#0A13E6] text-white disabled:opacity-40"
            >
              <Send size={17} />
            </button>
          </div>
        </form>
      ) : (
        thread && (
          <p className="border-t p-4 text-center text-xs text-black/50">
            {thread.status === 'pending'
              ? 'Chat request awaiting acceptance.'
              : 'This conversation is closed or blocked.'}
          </p>
        )
      )}
    </section>
  )
}

export function NewAssociateChat({ onOpen, onBack }) {
  const [search, setSearch] = useState(''),
    [people, setPeople] = useState([]),
    [person, setPerson] = useState(null),
    [text, setText] = useState(''),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(''),
    [loading, setLoading] = useState(false)
  useEffect(() => {
    let valid = true
    if (search.trim().replace(/^[@^]+/, '').length < 2) {
      setPeople([])
      setLoading(false)
      return
    }
    setLoading(true)
    const timer = setTimeout(
      () =>
        api
          .searchCommunityUsers(search.trim())
          .then((d) => {
            if (valid) setPeople(d.users || [])
          })
          .catch((e) => {
            if (valid) setError(e.message)
          })
          .finally(() => {
            if (valid) setLoading(false)
          }),
      350,
    )
    return () => {
      valid = false
      clearTimeout(timer)
    }
  }, [search])
  async function send(e) {
    e.preventDefault()
    if (!person || !text.trim() || busy) return
    setBusy(true)
    setError('')
    try {
      const d = await api.communityChatAction({
        action: 'community_start',
        recipient_id: person.id,
        text,
      })
      onOpen(d.thread_id)
    } catch (e) {
      setError(e.message)
    } finally {
      setBusy(false)
    }
  }
  return (
    <section className="h-full overflow-y-auto bg-white p-5">
      <header className="mb-5 flex items-center gap-3">
        <button
          type="button"
          aria-label="Back to conversations"
          onClick={onBack}
        >
          <ArrowLeft size={20} />
        </button>
        <h2 className="font-bold">New message</h2>
      </header>
      <p className="mb-4 text-sm text-black/50">
        Find an Associate and send an introduction.
      </p>
      <label className="flex items-center gap-2 rounded-full border px-3">
        <Search size={16} />
        <input
          aria-label="Find an Associate"
          placeholder="Search by username"
          value={search}
          onChange={(e) => {
            setSearch(e.target.value)
            setPerson(null)
          }}
          className="min-w-0 flex-1 bg-transparent py-3 text-sm outline-none"
        />
      </label>
      {loading && <p className="p-3 text-xs">Searching…</p>}
      {people.map((p) => (
        <button
          key={p.id}
          type="button"
          onClick={() => setPerson(p)}
          aria-pressed={person?.id === p.id}
          className={`my-2 block w-full rounded-xl p-3 text-left ${person?.id === p.id ? 'bg-blue-50' : 'hover:bg-black/5'}`}
        >
          <strong className="block text-sm">{p.full_name || p.username}</strong>
          <span className="text-xs text-black/50">^{p.username}</span>
        </button>
      ))}
      {!loading && search.length > 1 && !people.length && (
        <p className="p-3 text-xs text-black/50">No matching Associates.</p>
      )}
      {error && (
        <p role="alert" className="py-3 text-sm text-red-700">
          {error}
        </p>
      )}
      {person && (
        <form onSubmit={send} className="mt-4 space-y-3">
          <label className="block text-sm" htmlFor="introduction">
            Message to {person.full_name || person.username}
          </label>
          <textarea
            id="introduction"
            required
            maxLength={2000}
            disabled={busy}
            value={text}
            onChange={(e) => setText(e.target.value)}
            placeholder="Introduce yourself…"
            className="w-full rounded-xl border p-3 text-sm"
          />
          <p className="text-xs text-black/50">
            Further messages require their acceptance.
          </p>
          <button
            disabled={busy || !text.trim()}
            className="rounded-full bg-[#0A13E6] px-5 py-3 text-sm font-semibold text-white disabled:opacity-40"
          >
            {busy ? 'Sending…' : 'Send request'}
          </button>
        </form>
      )}
    </section>
  )
}
export default AssociateThread
