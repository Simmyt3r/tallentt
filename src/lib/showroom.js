// Path: src/lib/showroom.js
// Small, dependency-free helpers for the Showroom feed and its detail modal.

export const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

// Client-side Fisher–Yates. Only ever used to reorder what is *presented* —
// the API's own ordering (bookings + orbit score + likes) is never touched.
export function shuffle(items, random = Math.random) {
  const out = [...items]
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1))
    ;[out[i], out[j]] = [out[j], out[i]]
  }
  return out
}

function sameOrder(a, b) {
  return a.length === b.length && a.every((v, i) => v === b[i])
}

// The next "lap" of the endless feed: a fresh shuffle of `ids` that
//  - never opens with `previousLastId` when any other id could open it, so
//    the seam between two laps never shows the same post twice in a row;
//  - differs from `previousOrder` when there are enough ids for that to be
//    possible (with 2 ids the seam rule and "different order" can't both
//    hold, and the seam rule wins).
export function nextLap(ids, previousLastId, previousOrder) {
  if (ids.length <= 1) return [...ids]
  let out = ids
  for (let attempt = 0; attempt < 6; attempt++) {
    out = shuffle(ids)
    if (out[0] === previousLastId) {
      const j = 1 + Math.floor(Math.random() * (out.length - 1))
      ;[out[0], out[j]] = [out[j], out[0]]
    }
    if (out.length < 3 || !previousOrder || !sameOrder(out, previousOrder)) break
  }
  return out
}

// Canonical route for one Showroom post (a post is a talent hat's current
// media, so its id is the hat id). App.jsx registers /showroom/:postId?.
export function showroomPath(id) {
  return `/showroom/${encodeURIComponent(id)}`
}

// Full share URL, built from wherever the app is currently served. The router
// is mounted without a basename (see main.jsx), so origin + path is exactly
// what the router resolves — nothing about the production domain is baked in.
export function showroomUrl(id) {
  return `${window.location.origin}${showroomPath(id)}`
}

async function copyText(text) {
  try {
    if (navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(text)
      return true
    }
  } catch {
    // fall through to the legacy path (insecure origin, denied permission…)
  }
  try {
    const ta = document.createElement('textarea')
    ta.value = text
    ta.setAttribute('readonly', '')
    ta.style.cssText = 'position:fixed;top:0;left:0;opacity:0;pointer-events:none'
    document.body.appendChild(ta)
    ta.select()
    const ok = document.execCommand('copy')
    ta.remove()
    return ok
  } catch {
    return false
  }
}

// Shared by the feed's Share button and the detail modal's Share buttons so
// both hand out the same canonical URL. Resolves to 'shared' | 'copied' |
// 'cancelled' | 'failed'; the caller decides what feedback to show.
export async function shareShowroomPost({ id, username }) {
  const url = showroomUrl(id)
  if (typeof navigator !== 'undefined' && typeof navigator.share === 'function') {
    try {
      // Must be the first await so it still counts as part of the user's click.
      await navigator.share({
        title: username ? `${username} on the ChombuTar Showroom` : 'ChombuTar Showroom',
        url,
      })
      return 'shared'
    } catch (err) {
      if (err?.name === 'AbortError') return 'cancelled'
      // Any other failure (NotAllowedError, unsupported target…) → copy instead.
    }
  }
  return (await copyText(url)) ? 'copied' : 'failed'
}

// The element that actually scrolls the app. <html> and <body> both have
// `overflow-x: hidden` + `height: 100%` (styles/index.css), which makes <body>
// its own scroll container and leaves window.scrollY stuck at 0. Resolved from
// computed style rather than assumed, so it keeps working if that CSS changes.
export function getScroller() {
  const html = document.documentElement
  const body = document.body
  const bodyOY = getComputedStyle(body).overflowY
  if (getComputedStyle(html).overflowY !== 'visible' && (bodyOY === 'auto' || bodyOY === 'scroll')) return body
  return document.scrollingElement || html
}
