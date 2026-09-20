// Path: src/components/hatform/Dialog.jsx
import { useEffect, useRef } from 'react'
import { createPortal } from 'react-dom'

const FOCUSABLE =
  'a[href], button:not([disabled]), input:not([disabled]):not([type="hidden"]), select:not([disabled]), textarea:not([disabled]), video[controls], audio[controls], [tabindex]:not([tabindex="-1"])'

// Modal used by the Hat form (Preview, media viewer, discard confirmation).
//  - variant "sheet": the app's .modal-overlay/.modal-panel — centered on
//    desktop, full-screen on phones (see styles/index.css).
//  - variant "alert": a small centered confirmation.
// Handles Escape, Tab wrapping, focus restore, and page scroll lock without
// the position:fixed jump the .modal-open helper class causes (that class
// resets the scroll position, which would throw the user back to the top of
// a long form when a dialog closes).
export default function Dialog({
  open,
  onClose,
  labelledBy,
  describedBy,
  variant = 'sheet',
  role = 'dialog',
  maxWidth,
  initialFocusRef,
  children,
}) {
  const panelRef = useRef(null)
  const onCloseRef = useRef(onClose)
  onCloseRef.current = onClose

  useEffect(() => {
    if (!open) return undefined
    const previouslyFocused = document.activeElement
    const html = document.documentElement
    const body = document.body
    const prev = { html: html.style.overflow, body: body.style.overflow }
    html.style.overflow = 'hidden'
    body.style.overflow = 'hidden'

    const focusFirst = () => {
      const target = initialFocusRef?.current || panelRef.current?.querySelector(FOCUSABLE) || panelRef.current
      target?.focus?.({ preventScroll: true })
    }
    focusFirst()

    const onKeyDown = (e) => {
      if (e.key === 'Escape') {
        e.stopPropagation()
        onCloseRef.current?.()
        return
      }
      if (e.key !== 'Tab' || !panelRef.current) return
      const items = Array.from(panelRef.current.querySelectorAll(FOCUSABLE)).filter((el) => el.offsetParent !== null || el === document.activeElement)
      if (!items.length) {
        e.preventDefault()
        return
      }
      const first = items[0]
      const last = items[items.length - 1]
      if (e.shiftKey && (document.activeElement === first || !panelRef.current.contains(document.activeElement))) {
        e.preventDefault()
        last.focus()
      } else if (!e.shiftKey && (document.activeElement === last || !panelRef.current.contains(document.activeElement))) {
        e.preventDefault()
        first.focus()
      }
    }
    document.addEventListener('keydown', onKeyDown, true)

    return () => {
      document.removeEventListener('keydown', onKeyDown, true)
      html.style.overflow = prev.html
      body.style.overflow = prev.body
      if (previouslyFocused && document.contains(previouslyFocused)) previouslyFocused.focus?.({ preventScroll: true })
    }
  }, [open, initialFocusRef])

  if (!open) return null

  const overlayClass =
    variant === 'alert'
      ? 'fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4'
      : 'modal-overlay'
  const panelClass =
    variant === 'alert'
      ? 'relative w-full max-w-[380px] rounded-[20px] border-[1.5px] border-black bg-white p-5 shadow-[0_20px_60px_-12px_rgba(0,0,0,0.25)]'
      : 'modal-panel'

  return createPortal(
    <div
      className={overlayClass}
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onCloseRef.current?.()
      }}
    >
      <div
        ref={panelRef}
        role={role}
        aria-modal="true"
        aria-labelledby={labelledBy}
        aria-describedby={describedBy}
        tabIndex={-1}
        className={panelClass}
        style={variant === 'sheet' && maxWidth ? { maxWidth } : undefined}
      >
        {children}
      </div>
    </div>,
    document.body,
  )
}
