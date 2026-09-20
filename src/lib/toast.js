// Path: src/lib/toast.js
//
// A tiny status toast that lives outside React, so it survives the route
// change that follows a successful save ("Hat published" appears on My Hats).
// Announced to screen readers through a polite live region; respects safe
// areas and sits above the mobile bottom nav.
const HOST_ID = 'chombutar-toast-host'

function getHost() {
  let host = document.getElementById(HOST_ID)
  if (!host) {
    host = document.createElement('div')
    host.id = HOST_ID
    host.setAttribute('role', 'status')
    host.setAttribute('aria-live', 'polite')
    host.style.cssText =
      'position:fixed;left:0;right:0;bottom:calc(76px + env(safe-area-inset-bottom, 0px));display:flex;flex-direction:column;align-items:center;gap:8px;padding:0 16px;z-index:60;pointer-events:none;'
    document.body.appendChild(host)
  }
  return host
}

export function showToast(message, { duration = 3500 } = {}) {
  if (typeof document === 'undefined' || !message) return
  const host = getHost()
  const el = document.createElement('div')
  el.textContent = message
  el.style.cssText =
    'max-width:420px;background:#000;color:#fff;border:1.5px solid #000;border-radius:999px;padding:10px 18px;font:600 13px/1.3 Inter,ui-sans-serif,system-ui,sans-serif;box-shadow:0 8px 24px rgba(0,0,0,.25);'
  // Added on the next frame so assistive tech reliably announces the change.
  requestAnimationFrame(() => host.appendChild(el))
  setTimeout(() => el.remove(), duration)
}
