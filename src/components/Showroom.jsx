import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { useLocation, useNavigate, useParams } from 'react-router-dom'
import { Plus, Search } from 'lucide-react'
import { api } from '../lib/api'
import { useAuth } from '../context/AuthContext'
import { UUID_RE, getScroller, nextLap, shareShowroomPost, showroomPath } from '../lib/showroom'
import { getPrimaryIdentity, identityFromHat, normalizeUsername } from '../lib/profile.js'
import AddShowroomMedia from './AddShowroomMedia'
import ShowroomDetailModal from './ShowroomDetailModal'
import ShowroomPost from './ShowroomPost'

// How many posts are kept mounted above/below the ones on screen, and how far
// ahead of the last visible post the endless sequence is topped up.
const BUFFER = 2
const PRELOAD = 5

const keyToId = (key) => key.slice(0, key.indexOf('~'))

// Showroom — a continuous, endless discovery feed.
//
//  • Each post is a fixed-height card (see `.sr-post` in styles/index.css) that
//    roughly fills the space under the app + Showroom headers. Scrolling is
//    ordinary and continuous — no snapping.
//  • The feed is endless: the first lap is the API's curated order, every lap
//    after that is a fresh client-side shuffle (never opening with the post the
//    previous lap ended on), appended well before the user reaches the end.
//  • It never grows without bound in the DOM: because every post has the same
//    height, only the few posts near the viewport are mounted and the rest are
//    stood in for by padding of the exact same height, so scroll position is
//    stable however far the user goes.
//  • "View" opens the detail modal by pushing /showroom/:postId. The modal is
//    derived from that URL, and the feed underneath is the same mounted
//    component, so it keeps its scroll position and sequence. Back, refresh
//    and shared links all work because the URL is the single source of truth.
export default function Showroom() {
  const { user } = useAuth()
  const { postId } = useParams()
  const location = useLocation()
  const navigate = useNavigate()
  const modalOpen = Boolean(postId)

  // Creating Showroom content is Talent-only. 'dual' accounts are Talent too;
  // only a pure Client account is excluded. The API enforces the same rule
  // (api/hats), this just avoids rendering a control that could never work.
  const canAdd = user?.role === 'talent' || user?.role === 'dual'

  // ── data ──────────────────────────────────────────────────────────────
  // hatMap holds every hat we know about (the Showroom list plus any post
  // opened directly by link); listIds is the API's ordering of the list.
  const [hatMap, setHatMap] = useState({})
  const [listIds, setListIds] = useState([])
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState('')
  const [reloadTick, setReloadTick] = useState(0)
  const [search, setSearch] = useState('')
  const [postState, setPostState] = useState({ id: null, state: 'idle' })
  const [retryTick, setRetryTick] = useState(0)

  // ── ui ────────────────────────────────────────────────────────────────
  const [muted, setMuted] = useState(false) // shared across posts; sound on by default
  const [showAdd, setShowAdd] = useState(false)
  const [toast, setToast] = useState('')
  const [pageVisible, setPageVisible] = useState(() => !document.hidden)
  const [activeKey, setActiveKey] = useState(null)

  // ── endless sequence + windowing ────────────────────────────────────────
  const [seq, setSeq] = useState([]) // [{ key, id }] — ids only, tiny
  const [vis, setVis] = useState({ first: 0, last: 0 })
  const [step, setStep] = useState(0) // one post's height + gap, measured

  const listRef = useRef(null)
  const headerRef = useRef(null)
  const hatMapRef = useRef(hatMap)
  const seqRef = useRef(seq)
  const filteredRef = useRef([])
  const stepRef = useRef(0)
  const anchorRef = useRef(null)
  const cycleRef = useRef(1)
  const lastResetRef = useRef(null)
  const ioRef = useRef(null)
  const intersectingRef = useRef(new Set())
  const feedViewedRef = useRef(new Set())
  const modalViewedRef = useRef(new Set())
  const likingRef = useRef(new Set())
  const closingRef = useRef(false)
  const toastTimer = useRef(0)
  const fromShowroomRef = useRef(false)

  hatMapRef.current = hatMap
  seqRef.current = seq
  fromShowroomRef.current = Boolean(location.state?.fromShowroom)

  // ── loading the list ──────────────────────────────────────────────────
  const applyList = useCallback((hats) => {
    setHatMap((prev) => {
      const next = { ...prev }
      for (const h of hats) next[h.id] = h
      return next
    })
    setListIds(hats.map((h) => h.id))
  }, [])

  // `cancelled` makes sure only the response for the current mount is applied
  // (React.StrictMode double-invokes mount effects in dev — see main.jsx).
  useEffect(() => {
    let cancelled = false
    ;(async () => {
      try {
        const data = await api.getShowroom()
        if (!cancelled) applyList(data.hats || [])
      } catch (e) {
        if (!cancelled) {
          console.error(e)
          setLoadError(e.message || 'Could not load the Showroom.')
        }
      } finally {
        if (!cancelled) setLoading(false)
      }
    })()
    return () => {
      cancelled = true
    }
  }, [applyList, reloadTick])

  // After a Talent adds media: refresh in place — no skeleton, and the feed's
  // sequence and scroll position are left alone.
  const refreshShowroom = useCallback(async () => {
    try {
      const data = await api.getShowroom()
      applyList(data.hats || [])
    } catch (e) {
      console.error(e)
    }
  }, [applyList])

  const patchHat = useCallback((id, patch) => {
    setHatMap((prev) => (prev[id] ? { ...prev, [id]: { ...prev[id], ...patch } } : prev))
  }, [])

  // ── search ────────────────────────────────────────────────────────────
  const filteredIds = useMemo(() => {
    // `^simeon` (the Talent display handle) searches the raw username `simeon`.
    const q = normalizeUsername(search).toLowerCase()
    return listIds.filter((id) => {
      const h = hatMap[id]
      if (!h) return false
      if (!q) return true
      return (
        (h.username || '').toLowerCase().includes(q) ||
        (h.hat_title || '').toLowerCase().includes(q) ||
        (h.skills || []).some((s) => s.toLowerCase().includes(q))
      )
    })
  }, [listIds, hatMap, search])
  // Likes/views patch hatMap constantly; the *set of ids* rarely changes.
  const idsSig = filteredIds.join('|')
  filteredRef.current = filteredIds
  const resetKey = search.trim().toLowerCase()

  // First lap = the API's curated order. Rebuilt only for a new search (which
  // also returns to the top); a refresh merely drops posts that disappeared.
  useEffect(() => {
    if (loading) return
    const ids = filteredRef.current
    const prev = seqRef.current
    if (lastResetRef.current !== resetKey || prev.length === 0) {
      if (!(ids.length === 0 && prev.length === 0)) {
        cycleRef.current = 1
        setSeq(ids.map((id) => ({ key: `${id}~0`, id })))
        intersectingRef.current.clear()
        setActiveKey(null)
      }
      if (lastResetRef.current !== null && lastResetRef.current !== resetKey) {
        getScroller().scrollTo({ top: 0 })
      }
    } else {
      const allowed = new Set(ids)
      const next = prev.filter((it) => allowed.has(it.id))
      if (next.length !== prev.length) setSeq(next)
    }
    lastResetRef.current = resetKey
  }, [loading, resetKey, idsSig])

  // Top the sequence up well before the end: append a freshly shuffled lap
  // whenever fewer than PRELOAD posts remain beyond the last visible one. It is
  // pure client-side work on ids, so there is never a loading state. A single
  // post is never repeated.
  useEffect(() => {
    if (loading || seq.length === 0 || filteredIds.length < 2) return
    if (seq.length >= vis.last + 1 + PRELOAD) return
    const ids = filteredRef.current
    const lastId = seq[seq.length - 1]?.id
    const previousLap = seq.slice(-ids.length).map((it) => it.id)
    const order = nextLap(ids, lastId, previousLap)
    const n = cycleRef.current++
    setSeq([...seq, ...order.map((id) => ({ key: `${id}~${n}`, id }))])
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [seq, vis.last, loading, idsSig])

  // ── windowing maths ───────────────────────────────────────────────────
  const measure = useCallback(() => {
    const list = listRef.current
    const first = list?.querySelector('[data-post-key]')
    if (!first) return
    const gap = parseFloat(getComputedStyle(first).marginBottom) || 0
    const next = Math.round((first.offsetHeight + gap) * 100) / 100
    if (!next || next === stepRef.current) return
    const old = stepRef.current
    if (old) {
      // Post height changed (window resized / device rotated): remember which
      // point of the sequence is at the top so the same content stays there.
      const regionTop = headerRef.current?.getBoundingClientRect().bottom ?? 0
      anchorRef.current = (regionTop - list.getBoundingClientRect().top) / old
    }
    stepRef.current = next
    setStep(next)
  }, [])

  const computeVis = useCallback(() => {
    const list = listRef.current
    const s = stepRef.current
    if (!list || !s) return
    const top = list.getBoundingClientRect().top
    const regionTop = headerRef.current ? headerRef.current.getBoundingClientRect().bottom : 0
    const max = Math.max(0, seqRef.current.length - 1)
    const first = Math.min(max, Math.max(0, Math.floor((regionTop - top) / s)))
    const last = Math.min(max, Math.max(first, Math.floor((window.innerHeight - top) / s)))
    setVis((prev) => (prev.first === first && prev.last === last ? prev : { first, last }))
  }, [])

  useLayoutEffect(() => {
    measure()
  })

  useLayoutEffect(() => {
    const anchor = anchorRef.current
    if (anchor != null && step) {
      anchorRef.current = null
      const regionTop = headerRef.current?.getBoundingClientRect().bottom ?? 0
      const current = regionTop - listRef.current.getBoundingClientRect().top
      getScroller().scrollBy(0, anchor * step - current)
    }
    computeVis()
  }, [step, seq.length, computeVis])

  useEffect(() => {
    let raf = 0
    const onScroll = () => {
      if (raf) return
      raf = requestAnimationFrame(() => {
        raf = 0
        computeVis()
      })
    }
    const onResize = () => {
      measure()
      onScroll()
    }
    // Capture, because <body> (not window) is what scrolls and scroll events
    // don't bubble.
    window.addEventListener('scroll', onScroll, { passive: true, capture: true })
    window.addEventListener('resize', onResize)
    window.addEventListener('orientationchange', onResize)
    return () => {
      if (raf) cancelAnimationFrame(raf)
      window.removeEventListener('scroll', onScroll, { capture: true })
      window.removeEventListener('resize', onResize)
      window.removeEventListener('orientationchange', onResize)
    }
  }, [computeVis, measure])

  const start = Math.max(0, vis.first - BUFFER)
  const end = Math.min(seq.length, vis.last + BUFFER + 1)

  // ── which post is "active" (the only one allowed to play) ───────────────
  // A zero-height band across the middle of the viewport: whichever post it
  // crosses is the one being looked at. Independent of header/nav heights.
  const observePost = useCallback((el) => {
    if (typeof IntersectionObserver === 'undefined') return undefined
    let io = ioRef.current
    if (!io) {
      io = new IntersectionObserver(
        (entries) => {
          for (const entry of entries) {
            const key = entry.target.dataset.postKey
            if (!key) continue
            if (entry.isIntersecting) intersectingRef.current.add(key)
            else intersectingRef.current.delete(key)
          }
          // Nothing under the band (e.g. the 16px gap between two posts, or a
          // fast jump before the next post has mounted) means nothing plays.
          const keys = [...intersectingRef.current]
          setActiveKey(keys.length ? keys[keys.length - 1] : null)
        },
        { rootMargin: '-50% 0px -50% 0px' },
      )
      ioRef.current = io
    }
    io.observe(el)
    const key = el.dataset.postKey
    return () => {
      io.unobserve(el)
      intersectingRef.current.delete(key)
    }
  }, [])

  useEffect(
    () => () => {
      ioRef.current?.disconnect()
      ioRef.current = null
    },
    [],
  )

  useEffect(() => {
    const onVis = () => setPageVisible(!document.hidden)
    document.addEventListener('visibilitychange', onVis)
    return () => document.removeEventListener('visibilitychange', onVis)
  }, [])

  // One view per hat per visit for the feed (video posts, as before).
  useEffect(() => {
    if (!activeKey || modalOpen) return
    const id = keyToId(activeKey)
    const hat = hatMapRef.current[id]
    if (!hat || hat.media?.[0]?.type !== 'video' || feedViewedRef.current.has(id)) return
    feedViewedRef.current.add(id)
    patchHat(id, { views: (hat.views || 0) + 1 })
    api.recordView(id).catch(() => {})
  }, [activeKey, modalOpen, patchHat])

  // ── engagement ────────────────────────────────────────────────────────
  const toggleLike = useCallback(
    async (id) => {
      const hat = hatMapRef.current[id]
      if (!hat || likingRef.current.has(id)) return
      likingRef.current.add(id)
      const next = !hat.liked_by_me
      const prevLikes = hat.likes || 0
      patchHat(id, { liked_by_me: next, likes: Math.max(0, prevLikes + (next ? 1 : -1)) })
      try {
        await api.toggleLike(id)
      } catch {
        patchHat(id, { liked_by_me: !next, likes: prevLikes })
      } finally {
        likingRef.current.delete(id)
      }
    },
    [patchHat],
  )

  const notify = useCallback((message) => {
    setToast(message)
    clearTimeout(toastTimer.current)
    toastTimer.current = setTimeout(() => setToast(''), 2400)
  }, [])
  useEffect(() => () => clearTimeout(toastTimer.current), [])

  // Feed and modal both come through here → the same canonical URL.
  const handleShare = useCallback(
    async (hat) => {
      const result = await shareShowroomPost({ id: hat.id, name: getPrimaryIdentity(identityFromHat(hat)) })
      if (result === 'copied') notify('Link copied')
      else if (result === 'failed') notify("Couldn't copy the link")
    },
    [notify],
  )

  // ── the detail modal (driven by the URL) ──────────────────────────────
  const openDetail = useCallback(
    (id) => {
      const target = showroomPath(id)
      if (window.location.pathname === target) return // rapid double click
      closingRef.current = false
      navigate(target, { state: { fromShowroom: true } })
    },
    [navigate],
  )

  // Closing pops the entry View pushed (so history stays tidy and the feed is
  // exactly where it was). A link opened cold has nothing to pop → go to the
  // plain Showroom instead of leaving the app.
  const closeDetail = useCallback(() => {
    if (closingRef.current) return
    closingRef.current = true
    if (fromShowroomRef.current) navigate(-1)
    else navigate('/showroom', { replace: true })
  }, [navigate])
  useEffect(() => {
    if (!postId) closingRef.current = false
  }, [postId])

  // Picking a related post swaps the SAME modal: replace, don't push, so one
  // Back/close still returns to the feed.
  const selectRelated = useCallback(
    (id) => {
      navigate(showroomPath(id), { replace: true, state: { fromShowroom: fromShowroomRef.current } })
    },
    [navigate],
  )

  // A shared link may point at a post that isn't in the loaded list.
  useEffect(() => {
    if (!postId || loading) return undefined
    if (hatMapRef.current[postId]) return undefined
    if (!UUID_RE.test(postId)) {
      setPostState({ id: postId, state: 'unavailable' })
      return undefined
    }
    let cancelled = false
    setPostState({ id: postId, state: 'loading' })
    api
      .getHat(postId)
      .then(({ hat }) => {
        if (cancelled) return
        // Only live talent hats belong in the Showroom.
        if (!hat || hat.active === false || hat.role !== 'talent') {
          setPostState({ id: postId, state: 'unavailable' })
          return
        }
        setHatMap((prev) => ({ ...prev, [hat.id]: hat }))
        setPostState({ id: postId, state: 'ready' })
      })
      .catch((err) => {
        if (!cancelled) setPostState({ id: postId, state: err?.status === 404 ? 'unavailable' : 'error' })
      })
    return () => {
      cancelled = true
    }
  }, [postId, loading, retryTick])

  const activeHat = postId ? hatMap[postId] || null : null
  const activeHatId = activeHat?.id
  let modalStatus = 'loading'
  if (activeHat) modalStatus = 'ready'
  else if (!loading && postState.id === postId && postState.state !== 'ready') modalStatus = postState.state

  // One view per post per time the modal is open.
  useEffect(() => {
    if (!postId) {
      modalViewedRef.current.clear()
      return
    }
    const hat = hatMapRef.current[postId]
    if (!hat || modalViewedRef.current.has(postId)) return
    modalViewedRef.current.add(postId)
    patchHat(postId, { views: (hat.views || 0) + 1 })
    api.recordView(postId).catch(() => {})
  }, [postId, activeHatId, patchHat])

  // "Related": what the feed would show next after this post, minus this post.
  const related = useMemo(() => {
    if (!postId) return []
    const ids = filteredRef.current
    const i = ids.indexOf(postId)
    const rotated = i === -1 ? ids : [...ids.slice(i + 1), ...ids.slice(0, i)]
    return rotated.filter((id) => id !== postId).map((id) => hatMap[id]).filter(Boolean)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [postId, idsSig, hatMap])

  // ── render ────────────────────────────────────────────────────────────
  const items = seq.slice(start, end)
  const singlePost = filteredIds.length === 1

  let body
  if (loading) {
    body = (
      <div className="sr-post mt-2 -mx-4 md:mx-0 flex items-center justify-center bg-white border-y md:border border-black/15 md:rounded-[20px] animate-pulse">
        <p className="text-black/40 text-[13px] font-medium">Loading showroom…</p>
      </div>
    )
  } else if (loadError && listIds.length === 0) {
    body = (
      <div className="py-16 text-center space-y-3">
        <p className="text-black/50 text-[13px] font-medium">{loadError}</p>
        <button
          type="button"
          onClick={() => {
            setLoadError('')
            setLoading(true)
            setReloadTick((t) => t + 1)
          }}
          className="tw-btn-ghost h-10 px-5 text-[13px] inline-flex items-center justify-center"
        >
          Try again
        </button>
      </div>
    )
  } else if (listIds.length === 0) {
    body = (
      <p className="text-black/45 py-16 text-center text-[13px] font-medium">
        Nothing in the Showroom yet.{canAdd ? ' Tap + to add the first post.' : ''}
      </p>
    )
  } else if (filteredIds.length === 0) {
    body = <p className="text-black/45 py-16 text-center text-[13px] font-medium">No talents match your search.</p>
  } else {
    body = (
      <>
        <section
          ref={listRef}
          aria-label="Showroom posts"
          className="mt-2 -mx-4 md:mx-0"
          style={{
            paddingTop: start * step,
            paddingBottom: Math.max(0, seq.length - end) * step,
            overflowAnchor: 'none',
          }}
        >
          {items.map((it) => {
            const hat = hatMap[it.id]
            if (!hat) return null
            return (
              <ShowroomPost
                key={it.key}
                postKey={it.key}
                hat={hat}
                playing={it.key === activeKey && !modalOpen && pageVisible}
                muted={muted}
                onMutedChange={setMuted}
                onLike={toggleLike}
                onShare={handleShare}
                onView={openDetail}
                observe={observePost}
              />
            )
          })}
        </section>
        {singlePost && (
          <p className="text-black/40 text-[12px] font-medium text-center py-6">You’re all caught up.</p>
        )}
      </>
    )
  }

  return (
    <div className="relative -mt-5 md:-mt-7" style={{ minHeight: 'calc(var(--app-vh) - var(--sr-app-top))' }}>
      <div
        ref={headerRef}
        style={{ top: 'var(--sr-app-top)', height: 'var(--sr-header-h)' }}
        className="sticky z-30 -mx-4 md:-mx-6 lg:-mx-8 px-4 md:px-6 lg:px-8 bg-[#F7F3EB]/95 backdrop-blur-md border-b border-black/10 flex items-center gap-3"
      >
        <h1 className="text-[20px] font-bold tracking-tight shrink-0">Showroom</h1>
        <div className="relative flex-1 min-w-0 md:flex-none md:w-[320px] ml-auto">
          <Search size={15} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-black/40 pointer-events-none" />
          <input
            type="search"
            aria-label="Search Showroom"
            placeholder="Search Showroom…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full pl-9 pr-3 h-10 rounded-full border-[1.5px] border-black bg-white text-[13px] font-medium outline-none focus:ring-4 focus:ring-black/[0.04]"
          />
        </div>
      </div>

      {body}

      {/* Showroom-level "+": lives outside every post, sticks to the bottom
          corner of the content area while scrolling (clear of the sidebar and
          of the mobile bottom nav / safe area), and is not rendered at all
          for Client accounts. */}
      {canAdd && (
        <div
          className="sticky z-40 h-0 flex justify-end pointer-events-none"
          style={{ bottom: 'var(--sr-fab-bottom)' }}
        >
          <button
            type="button"
            onClick={() => setShowAdd(true)}
            aria-label="Add to Showroom"
            title="Add to Showroom"
            className="pointer-events-auto -translate-y-full w-12 h-12 sm:w-14 sm:h-14 rounded-full bg-[#0A13E6] text-white flex items-center justify-center border-[1.5px] border-black shadow-[0_10px_30px_rgba(10,19,230,0.35)] hover:bg-black transition active:scale-95"
          >
            <Plus size={22} aria-hidden="true" />
          </button>
        </div>
      )}

      {canAdd && <AddShowroomMedia open={showAdd} onClose={() => setShowAdd(false)} onAdded={refreshShowroom} />}

      <div
        role="status"
        aria-live="polite"
        className="pointer-events-none fixed left-1/2 -translate-x-1/2 z-[70] bottom-[calc(76px+env(safe-area-inset-bottom,0px))] md:bottom-8"
      >
        {toast && (
          <div className="rounded-full bg-black text-white text-[13px] font-semibold px-4 py-2.5 shadow-lg animate-slide-up whitespace-nowrap">
            {toast}
          </div>
        )}
      </div>

      {modalOpen && (
        <ShowroomDetailModal
          hat={activeHat}
          status={modalStatus}
          related={related}
          muted={muted}
          onMutedChange={setMuted}
          onClose={closeDetail}
          onSelect={selectRelated}
          onLike={toggleLike}
          onShare={handleShare}
          onRetry={() => setRetryTick((t) => t + 1)}
          onNotify={notify}
        />
      )}
    </div>
  )
}
