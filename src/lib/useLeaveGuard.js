// Path: src/components/hatform/useLeaveGuard.js
import { useEffect, useRef } from 'react'

/**
 * Warns before the person loses unsaved work.
 *
 *  - Closing/refreshing the tab or leaving the site: the browser's own prompt.
 *  - Clicking any in-app link (sidebar, drawer, bottom nav, logo): intercepted
 *    and handed to `onBlocked(path)` so the page can show its own
 *    "Discard changes?" dialog, then navigate itself if they confirm.
 *
 * The app uses <BrowserRouter> (not a data router), which has no navigation
 * blocker, so the system Back button/gesture is not interceptable here.
 * `active` is read through a ref so the listeners are registered once.
 */
export default function useLeaveGuard(active, onBlocked) {
  const activeRef = useRef(active)
  const blockedRef = useRef(onBlocked)
  activeRef.current = active
  blockedRef.current = onBlocked

  useEffect(() => {
    const onBeforeUnload = (e) => {
      if (!activeRef.current) return
      e.preventDefault()
      e.returnValue = ''
    }

    const onClick = (e) => {
      if (!activeRef.current || e.defaultPrevented || e.button !== 0) return
      if (e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return
      const anchor = e.target instanceof Element ? e.target.closest('a[href]') : null
      if (!anchor || anchor.target === '_blank' || anchor.hasAttribute('download')) return
      let url
      try {
        url = new URL(anchor.href, window.location.href)
      } catch {
        return
      }
      if (url.origin !== window.location.origin) return
      const here = window.location.pathname + window.location.search
      const next = url.pathname + url.search
      if (next === here && !url.hash) return
      e.preventDefault()
      e.stopPropagation()
      blockedRef.current?.(next + url.hash)
    }

    window.addEventListener('beforeunload', onBeforeUnload)
    document.addEventListener('click', onClick, true) // capture: runs before the router's own handler
    return () => {
      window.removeEventListener('beforeunload', onBeforeUnload)
      document.removeEventListener('click', onClick, true)
    }
  }, [])
}
