// Path: src/lib/dialog.js
// Behaviour shared by the Showroom detail modal and the negotiation notice
// that opens above it.

import { useEffect, useRef } from 'react'

// ── Scroll lock ────────────────────────────────────────────────────────────
// In this app <html> and <body> both carry `overflow-x: hidden` and
// `height: 100%` (styles/index.css), which makes <body> — not the window —
// the element that actually scrolls. Locking therefore means switching that
// element to `overflow: hidden`: unlike the `position: fixed` trick it never
// disturbs the scroll offset, so closing a dialog leaves the page exactly
// where it was. The scrollbar's width is re-added as padding so the layout
// doesn't shift sideways when the bar disappears.
let lockCount = 0
let unlock = null

function applyLock() {
  const els = [document.documentElement, document.body]
  const saved = els.map((el) => ({
    el,
    overflow: el.style.overflow,
    paddingRight: el.style.paddingRight,
  }))
  const gutters = els.map((el) => Math.max(0, el.offsetWidth - el.clientWidth))
  els.forEach((el, i) => {
    const basePadding = parseFloat(getComputedStyle(el).paddingRight) || 0
    el.style.overflow = 'hidden'
    if (gutters[i] > 0) el.style.paddingRight = `${basePadding + gutters[i]}px`
  })
  return () => {
    saved.forEach(({ el, overflow, paddingRight }) => {
      el.style.overflow = overflow
      el.style.paddingRight = paddingRight
    })
  }
}

// Ref-counted, so a dialog opened above another dialog neither re-locks nor
// unlocks early.
export function useScrollLock() {
  useEffect(() => {
    lockCount += 1
    if (lockCount === 1) unlock = applyLock()
    return () => {
      lockCount -= 1
      if (lockCount === 0) {
        unlock?.()
        unlock = null
      }
    }
  }, [])
}

// ── Dialog stack ───────────────────────────────────────────────────────────
const stack = []

const FOCUSABLE =
  'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), audio[controls], video[controls], [tabindex]:not([tabindex="-1"])'

function focusableIn(container) {
  if (!container) return []
  return Array.from(container.querySelectorAll(FOCUSABLE)).filter(
    (el) => !el.hasAttribute('inert') && el.getClientRects().length > 0,
  )
}

// Call from any component that renders a dialog. While it is mounted:
//  - it sits on a stack, and only the TOPMOST dialog reacts to Escape or
//    traps Tab — so Escape on the negotiation notice closes just the notice;
//  - focus moves into it on mount and is pulled back if it escapes;
//  - on unmount focus returns to `returnFocusRef` if given, otherwise to
//    whatever had it before (without scrolling) — the explicit target matters
//    because some browsers (Safari) don't focus a button when it is clicked.
export function useDialog(containerRef, { onClose, initialFocusRef, returnFocusRef } = {}) {
  const onCloseRef = useRef(onClose)
  onCloseRef.current = onClose

  useEffect(() => {
    const token = {}
    stack.push(token)
    const isTop = () => stack[stack.length - 1] === token
    const previouslyFocused = document.activeElement

    const container = () => containerRef.current
    const focusFirst = () => {
      const target = initialFocusRef?.current || focusableIn(container())[0] || container()
      target?.focus?.({ preventScroll: true })
    }
    focusFirst()

    function onKeyDown(e) {
      if (!isTop()) return
      if (e.key === 'Escape') {
        e.preventDefault()
        e.stopPropagation()
        onCloseRef.current?.()
        return
      }
      if (e.key !== 'Tab') return
      const c = container()
      if (!c) return
      const items = focusableIn(c)
      if (!items.length) {
        e.preventDefault()
        c.focus?.({ preventScroll: true })
        return
      }
      const first = items[0]
      const last = items[items.length - 1]
      const active = document.activeElement
      if (!c.contains(active)) {
        e.preventDefault()
        first.focus({ preventScroll: true })
      } else if (e.shiftKey && (active === first || active === c)) {
        e.preventDefault()
        last.focus({ preventScroll: true })
      } else if (!e.shiftKey && active === last) {
        e.preventDefault()
        first.focus({ preventScroll: true })
      }
    }

    function onFocusIn(e) {
      if (!isTop()) return
      const c = container()
      if (c && !c.contains(e.target)) focusFirst()
    }

    document.addEventListener('keydown', onKeyDown, true)
    document.addEventListener('focusin', onFocusIn)
    return () => {
      document.removeEventListener('keydown', onKeyDown, true)
      document.removeEventListener('focusin', onFocusIn)
      const i = stack.indexOf(token)
      if (i !== -1) stack.splice(i, 1)
      const target = returnFocusRef?.current || previouslyFocused
      if (target instanceof HTMLElement && document.contains(target)) {
        target.focus({ preventScroll: true })
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])
}

// Backdrop that closes only on a genuine click *on the backdrop itself*: the
// press must start and end there, so dragging out of the panel, or clicking
// anything inside it, never dismisses.
export function useBackdropClose(onClose) {
  const pressed = useRef(false)
  const onCloseRef = useRef(onClose)
  onCloseRef.current = onClose
  return {
    onMouseDown: (e) => {
      pressed.current = e.target === e.currentTarget
    },
    onClick: (e) => {
      if (pressed.current && e.target === e.currentTarget) onCloseRef.current?.()
      pressed.current = false
    },
  }
}
