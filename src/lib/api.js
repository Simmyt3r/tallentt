// Path: src/lib/api.js
const base = ''

async function request(path, options = {}) {
  const res = await fetch(`${base}${path}`, {
    credentials: 'include',
    headers: { 'Content-Type': 'application/json', ...(options.headers || {}) },
    ...options,
  })
  const data = await res.json().catch(() => ({}))
  if (!res.ok) {
    const err = new Error(data.error || res.statusText || 'Request failed')
    err.status = res.status
    err.data = data
    throw err
  }
  return data
}

export const api = {
  // Auth — one consolidated endpoint (api/auth/index.js). Was six separate
  // files (login/logout/me/register/username-check/profile) until that
  // put the deployment over Vercel Hobby's 12-function cap; see the
  // comment at the top of api/auth/index.js.
  me: () => request('/api/auth?action=me'),
  register: (body) => request('/api/auth', { method: 'POST', body: JSON.stringify({ action: 'register', ...body }) }),
  login: (body) => request('/api/auth', { method: 'POST', body: JSON.stringify({ action: 'login', ...body }) }),
  logout: () => request('/api/auth', { method: 'POST', body: JSON.stringify({ action: 'logout' }) }),
  usernameCheck: (u) => request(`/api/auth?action=username-check&u=${encodeURIComponent(u)}`),
  updateProfile: (body) => request('/api/auth', { method: 'PUT', body: JSON.stringify(body) }),
  getNotifications: () => request('/api/auth?action=notifications'),
  markNotificationRead: (notificationId) =>
    request('/api/auth', {
      method: 'PUT',
      body: JSON.stringify({ action: 'mark_notification_read', notificationId }),
    }),
  markAllNotificationsRead: () =>
    request('/api/auth', {
      method: 'PUT',
      body: JSON.stringify({ action: 'mark_all_notifications_read' }),
    }),
  getBanks: () => request('/api/auth?action=banks'),
  resolveBankAccount: (accountNumber, bankCode) =>
    request(
      `/api/auth?action=resolve-account&account_number=${encodeURIComponent(accountNumber)}&bank_code=${encodeURIComponent(bankCode)}`,
    ),

  // Public profile — GET /api/users/:username (see api/users/[username].js).
  // Used for both the public profile page and (for the signed-in user's
  // own username) the owner's Portfolio/Active Hats/Reviews sections —
  // identity fields for "own profile" come from AuthContext's `user`
  // instead, since that's already the freshest copy after an edit.
  getUserProfile: (username) => request(`/api/users/${encodeURIComponent(username)}`),

  // Hats
  getHats: (params = {}) => {
    const q = new URLSearchParams(
      Object.fromEntries(Object.entries(params).filter(([, v]) => v != null && v !== '')),
    ).toString()
    return request(`/api/hats${q ? `?${q}` : ''}`)
  },
  getHat: (id) => request(`/api/hats/${id}`),
  // Normalized card-detail shape for BentoCardDetailModal — same endpoint,
  // extended with ?include=owner (see api/hats/[id].js buildCardDetail).
  getHatDetail: (id) => request(`/api/hats/${id}?include=owner`),
  createHat: (body) => request('/api/hats', { method: 'POST', body: JSON.stringify(body) }),
  updateHat: (id, body) => request(`/api/hats/${id}`, { method: 'PUT', body: JSON.stringify(body) }),
  setHatFeedVisibility: (id, visible, confirmed = false) =>
    request(`/api/hats/${id}`, {
      method: 'PATCH',
      body: JSON.stringify({ action: 'set_feed_visibility', feed_visible: visible, negotiation_fee_confirmed: confirmed }),
    }),
  deleteHat: (id) => request(`/api/hats/${id}`, { method: 'DELETE' }),
  recordView: (id) =>
  request(`/api/hats/${id}`, { method: 'PATCH', body: JSON.stringify({ action: 'view' }) }),
  toggleLike: (id) =>
  request(`/api/hats/${id}`, { method: 'PATCH', body: JSON.stringify({ action: 'like' }) }),
  getShowroom: () => request('/api/showroom'),
  getCategories: () => request('/api/hats?categories=1'),
  createCategory: (name) =>
    request('/api/hats', { method: 'POST', body: JSON.stringify({ action: 'create_category', name }) }),
  getSeekingSuggestions: (role, q) =>
    request(`/api/hats?suggest=1&role=${encodeURIComponent(role)}&q=${encodeURIComponent(q || '')}`),
  createEscrow: (body) => request('/api/escrows', { method: 'POST', body: JSON.stringify(body) }),
  fundEscrowWithWallet: (id, expected_amount) =>
    request(`/api/escrows/${id}/fund-wallet`, { method: 'POST', body: JSON.stringify({ expected_amount }) }),
  bookingAction: (id, action, body) => request(`/api/escrows/${id}/${action}`, { method: 'POST', body: JSON.stringify(body) }),
  generateBookingQr: (id, stage) => request(`/api/escrows/${id}/generate-qr`, { method: 'POST', body: JSON.stringify({ stage }) }),
  redeemBookingQr: (id, token) => request(`/api/escrows/${id}/redeem-qr`, { method: 'POST', body: JSON.stringify({ token }) }),
  getConversations: (before) => request(`/api/escrows?conversations=1${before ? `&before=${encodeURIComponent(before)}` : ''}`, { cache: 'no-store' }),
  getMessages: (id, before) => request(`/api/escrows?messages=1&escrow_id=${encodeURIComponent(id)}${before ? `&before=${encodeURIComponent(before)}` : ''}`, { cache: 'no-store' }),
  getBookingHistory: (id, before) => request(`/api/escrows?messages=1&escrow_id=${encodeURIComponent(id)}&events_before=${encodeURIComponent(before)}`, { cache: 'no-store' }),
  messageAction: (body) => request('/api/escrows', { method: 'POST', body: JSON.stringify(body) }),

  // Wallet — reuses the /api/escrows endpoint with a query param / action
  // field rather than a dedicated /api/wallet one (see api/escrows/index.js
  // and the 12-function-cap note next to getMyApplications below).
  getWallet: () => request('/api/escrows?wallet=1'),
  topupWallet: (reference) =>
    request('/api/escrows', { method: 'POST', body: JSON.stringify({ action: 'topup', reference }) }),
  withdrawWallet: (amount) =>
    request('/api/escrows', { method: 'POST', body: JSON.stringify({ action: 'withdraw', amount }) }),

  // Applications — same PATCH-action pattern as toggleLike/recordView
  // above, on the same /api/hats/:id endpoint (see api/hats/[id].js).
  applyToHat: (id, message, proposal = null) =>
    request(`/api/hats/${id}`, {
      method: 'PATCH',
      body: JSON.stringify({
        action: 'apply',
        message,
        ...(proposal ? { proposed_amount: proposal.amount, proposal_message: proposal.message || '' } : {}),
      }),
    }),
  withdrawApplication: (id) =>
    request(`/api/hats/${id}`, { method: 'PATCH', body: JSON.stringify({ action: 'withdraw' }) }),
  respondToApplication: (id, applicationId, status) =>
    request(`/api/hats/${id}`, {
      method: 'PATCH',
      body: JSON.stringify({ action: 'respond_application', application_id: applicationId, status }),
    }),
  getHatApplicants: (id) => request(`/api/hats/${id}?include=applications`),

  // My Applications / My Bookings — reuse the existing hats/escrows
  // endpoints with a query param rather than dedicated ones (see
  // api/hats/index.js and api/escrows/index.js for the 12-function-cap note).
  getMyApplications: () => request('/api/hats?applied=1'),
  getReceivedApplications: () => request('/api/hats?received_applications=1'),
  getMyBookings: () => request('/api/escrows?mine=1'),
  getMyDeals: () => request('/api/escrows?deals=1'),
  respondToBooking: (escrowId, status) =>
    request('/api/escrows', {
      method: 'POST',
      body: JSON.stringify({ action: 'respond_booking', escrow_id: escrowId, status }),
    }),

  // Admin — one consolidated endpoint to stay within Vercel Hobby's
  // function cap while still giving operations a real control panel.
  getAdminDashboard: () => request('/api/admin'),
  getDisputes: (status, before) => request(`/api/admin?action=disputes&status=${status}${before ? `&before=${encodeURIComponent(before)}` : ''}`),
  getDispute: (id, before, eventsBefore) => request(`/api/admin?action=dispute&escrow_id=${encodeURIComponent(id)}${before ? `&before=${encodeURIComponent(before)}` : ''}${eventsBefore ? `&events_before=${encodeURIComponent(eventsBefore)}` : ''}`),
  getLiveDisputes: () => request('/api/admin?action=live_disputes'),
  adminAction: (body) => request('/api/admin', { method: 'POST', body: JSON.stringify(body) }),

  // ChombuTar Live — MediaMTX media transport + Vercel metadata/actions.
  getLiveRooms: (status) => request(`/api/live${status ? `?status=${encodeURIComponent(status)}` : ''}`),
  getLiveRoom: (roomId) => request(`/api/live?room_id=${encodeURIComponent(roomId)}`),
  liveAction: (body) => request('/api/live', { method: 'POST', body: JSON.stringify(body) }),
}

export const MAX_UPLOAD_BYTES = 20 * 1024 * 1024
export const ALLOWED_UPLOAD_PREFIXES = ['image/', 'video/', 'audio/']

// Returns a user-facing message when `file` can't be uploaded, else ''.
// Exported so callers can reject a file before spending any bandwidth on it.
export function validateUploadFile(file) {
  if (!file) return 'Choose a file to upload.'
  if (file.size > MAX_UPLOAD_BYTES) return 'File is too large. Upload a file of 20MB or less.'
  if (!ALLOWED_UPLOAD_PREFIXES.some((prefix) => file.type?.startsWith(prefix))) {
    return 'Only image, video, and audio uploads are supported.'
  }
  return ''
}

// fetch() can't report upload progress, so callers that ask for progress (or
// cancellation) go through XMLHttpRequest instead. Rejects with
//   - name 'AbortError' when cancelled through `signal`
//   - code 'network' when the connection drops or times out mid-upload
function xhrUpload(url, formData, { onProgress, signal } = {}) {
  return new Promise((resolve, reject) => {
    const abortError = () => Object.assign(new Error('Upload cancelled.'), { name: 'AbortError' })
    if (signal?.aborted) return reject(abortError())

    const xhr = new XMLHttpRequest()
    const onAbort = () => xhr.abort()
    const cleanup = () => signal?.removeEventListener('abort', onAbort)

    xhr.open('POST', url)
    xhr.upload.onprogress = (e) => {
      if (e.lengthComputable && e.total > 0) onProgress?.(Math.min(1, e.loaded / e.total))
    }
    xhr.onload = () => {
      cleanup()
      let data = {}
      try {
        data = JSON.parse(xhr.responseText)
      } catch {
        data = {}
      }
      if (xhr.status >= 200 && xhr.status < 300) resolve(data)
      else reject(new Error(data.error?.message || 'Upload failed'))
    }
    xhr.onerror = () => {
      cleanup()
      reject(Object.assign(new Error('Upload interrupted. Check your connection and try again.'), { code: 'network' }))
    }
    xhr.ontimeout = xhr.onerror
    xhr.onabort = () => {
      cleanup()
      reject(abortError())
    }
    signal?.addEventListener('abort', onAbort, { once: true })
    xhr.send(formData)
  })
}

// `options.onProgress(fraction 0..1)` and `options.signal` are optional; with
// neither, this behaves exactly as it always has (a plain fetch).
export async function uploadToCloudinary(file, options = {}) {
  const invalid = validateUploadFile(file)
  if (invalid) throw new Error(invalid)

  const cloud = import.meta.env.VITE_CLOUDINARY_CLOUD_NAME
  const preset = import.meta.env.VITE_CLOUDINARY_UPLOAD_PRESET
  const folder = import.meta.env.VITE_CLOUDINARY_FOLDER || 'chombutar_hats'
  if (!cloud || !preset) throw new Error('Cloudinary env vars missing')

  const fd = new FormData()
  fd.append('file', file)
  fd.append('upload_preset', preset)
  fd.append('folder', folder)

  const endpoint = `https://api.cloudinary.com/v1_1/${cloud}/auto/upload`
  let data
  if (options.onProgress || options.signal) {
    data = await xhrUpload(endpoint, fd, options)
  } else {
    const res = await fetch(endpoint, { method: 'POST', body: fd })
    data = await res.json().catch(() => ({}))
    if (!res.ok) throw new Error(data.error?.message || 'Upload failed')
  }
  return {
    url: data.secure_url,
    public_id: data.public_id,
    type: data.resource_type || 'image',
  }
}

// Opens the Paystack Inline popup and resolves with the transaction
// reference once the user completes payment. That reference is only ever
// a claim at this point — api.fundEscrow() sends it to the server, which
// re-verifies it directly against Paystack (see api/_lib/paystack.js)
// before an escrow is ever marked as funded. Never trust this resolved
// value on its own to unlock anything client-side.
// Polls for window.PaystackPop for a few seconds before giving up. The
// script tag in index.html loads synchronously before our own bundle runs,
// so this is normally instant — but on a slow connection (a real
// consideration for Nigerian mobile networks) it can genuinely still be in
// flight when someone taps "Pay" a beat after the page paints.
function waitForPaystack(timeoutMs = 8000, intervalMs = 200) {
  return new Promise((resolve, reject) => {
    if (window.PaystackPop) return resolve()
    const start = Date.now()
    const timer = setInterval(() => {
      if (window.PaystackPop) {
        clearInterval(timer)
        resolve()
      } else if (Date.now() - start > timeoutMs) {
        clearInterval(timer)
        reject(
          new Error(
            'Paystack failed to load. Check your connection, disable any ad blocker, and try again.',
          ),
        )
      }
    }, intervalMs)
  })
}

export async function payWithPaystack({ email, amountNaira, reference, metadata }) {
  const isWalletTopup = metadata?.wallet_topup === true || metadata?.wallet_topup === 'true'
  if (!isWalletTopup) {
    throw new Error('Paystack can only be used to fund your ChombuTar wallet.')
  }

  const key = import.meta.env.VITE_PAYSTACK_PUBLIC_KEY
  if (!key) throw new Error('Paystack is not configured (VITE_PAYSTACK_PUBLIC_KEY missing).')
  if (!email) throw new Error('An email address is required to pay.')
  if (!amountNaira || amountNaira <= 0) throw new Error('Invalid payment amount.')

  await waitForPaystack()

  return new Promise((resolve, reject) => {
    const handler = window.PaystackPop.setup({
      key,
      email,
      amount: Math.round(amountNaira * 100), // Paystack takes kobo, not naira
      currency: 'NGN',
      ref: reference || `chombutar_${Date.now()}_${Math.floor(Math.random() * 1e6)}`,
      metadata: metadata || {},
      callback: (response) => resolve(response.reference),
      onClose: () => reject(new Error('Payment window closed before completing.')),
    })
    handler.openIframe()
  })
}

export function maskLeaks(text) {
  if (!text) return text
  return text.replace(/\b(whatsapp|telegram|tg\b|call me|my number|hmu|dm me)\b/gi, '••••')
}


