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
  // Auth
  me: () => request('/api/auth/me'),
  register: (body) => request('/api/auth/register', { method: 'POST', body: JSON.stringify(body) }),
  login: (body) => request('/api/auth/login', { method: 'POST', body: JSON.stringify(body) }),
  logout: () => request('/api/auth/logout', { method: 'POST' }),
  usernameCheck: (u) => request(`/api/auth/username-check?u=${encodeURIComponent(u)}`),
  updateProfile: (body) => request('/api/auth/profile', { method: 'PUT', body: JSON.stringify(body) }),
  getNotifications: () => request('/api/auth/profile?action=notifications'),
  markNotificationRead: (notificationId) =>
    request('/api/auth/profile', {
      method: 'PUT',
      body: JSON.stringify({ action: 'mark_notification_read', notificationId }),
    }),
  markAllNotificationsRead: () =>
    request('/api/auth/profile', {
      method: 'PUT',
      body: JSON.stringify({ action: 'mark_all_notifications_read' }),
    }),
  getBanks: () => request('/api/auth/profile?action=banks'),
  resolveBankAccount: (accountNumber, bankCode) =>
    request(
      `/api/auth/profile?action=resolve-account&account_number=${encodeURIComponent(accountNumber)}&bank_code=${encodeURIComponent(bankCode)}`,
    ),

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
  fundEscrow: (id, reference) =>
    request(`/api/escrows/${id}/fund`, { method: 'POST', body: JSON.stringify({ reference }) }),
  fundEscrowWithWallet: (id) => request(`/api/escrows/${id}/fund-wallet`, { method: 'POST' }),
  releaseEscrow: (id) => request(`/api/escrows/${id}/release`, { method: 'POST' }),

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
  applyToHat: (id, message) =>
    request(`/api/hats/${id}`, { method: 'PATCH', body: JSON.stringify({ action: 'apply', message }) }),
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
  getMyBookings: () => request('/api/escrows?mine=1'),

  // Admin — one consolidated endpoint to stay within Vercel Hobby's
  // function cap while still giving operations a real control panel.
  getAdminDashboard: () => request('/api/admin'),
  adminAction: (body) => request('/api/admin', { method: 'POST', body: JSON.stringify(body) }),
}

const MAX_UPLOAD_BYTES = 20 * 1024 * 1024
const ALLOWED_UPLOAD_PREFIXES = ['image/', 'video/', 'audio/']

export async function uploadToCloudinary(file) {
  if (!file) throw new Error('Choose a file to upload.')
  if (file.size > MAX_UPLOAD_BYTES) {
    throw new Error('File is too large. Upload a file of 20MB or less.')
  }
  if (!ALLOWED_UPLOAD_PREFIXES.some((prefix) => file.type?.startsWith(prefix))) {
    throw new Error('Only image, video, and audio uploads are supported.')
  }

  const cloud = import.meta.env.VITE_CLOUDINARY_CLOUD_NAME
  const preset = import.meta.env.VITE_CLOUDINARY_UPLOAD_PRESET
  const folder = import.meta.env.VITE_CLOUDINARY_FOLDER || 'chombutar_hats'
  if (!cloud || !preset) throw new Error('Cloudinary env vars missing')

  const fd = new FormData()
  fd.append('file', file)
  fd.append('upload_preset', preset)
  fd.append('folder', folder)

  const res = await fetch(`https://api.cloudinary.com/v1_1/${cloud}/auto/upload`, {
    method: 'POST',
    body: fd,
  })
  const data = await res.json().catch(() => ({}))
  if (!res.ok) throw new Error(data.error?.message || 'Upload failed')
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