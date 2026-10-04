import {
  createCipheriv,
  createECDH,
  createHmac,
  createPrivateKey,
  createHash,
  randomBytes,
  sign,
} from 'node:crypto'
import { query } from './db.js'

const CATEGORY_KEYS = ['deals', 'negotiations', 'messages', 'payments', 'live', 'marketing']
const MAX_PUSH_PAYLOAD = 3500

function base64UrlDecode(value) {
  const raw = String(value || '').replace(/-/g, '+').replace(/_/g, '/')
  const padding = '='.repeat((4 - (raw.length % 4)) % 4)
  return Buffer.from(raw + padding, 'base64')
}

function base64UrlEncode(value) {
  return Buffer.from(value).toString('base64url')
}

function hkdfExtract(salt, ikm) {
  return createHmac('sha256', salt).update(ikm).digest()
}

function hkdfExpand(prk, info, length) {
  const chunks = []
  let previous = Buffer.alloc(0)
  let counter = 1
  while (Buffer.concat(chunks).length < length) {
    previous = createHmac('sha256', prk)
      .update(Buffer.concat([previous, info, Buffer.from([counter])]))
      .digest()
    chunks.push(previous)
    counter += 1
  }
  return Buffer.concat(chunks).subarray(0, length)
}

function getVapidConfig() {
  const publicKey = String(process.env.VAPID_PUBLIC_KEY || '').trim()
  const privateKey = String(process.env.VAPID_PRIVATE_KEY || '').trim()
  const subject = String(process.env.VAPID_SUBJECT || '').trim()
  if (!publicKey || !privateKey || !subject) return null

  const publicRaw = base64UrlDecode(publicKey)
  const privateRaw = base64UrlDecode(privateKey)
  if (publicRaw.length !== 65 || publicRaw[0] !== 4 || privateRaw.length !== 32) {
    console.error('Push disabled: invalid VAPID key material.')
    return null
  }
  if (!/^mailto:.+@.+\..+$/i.test(subject) && !/^https:\/\//i.test(subject)) {
    console.error('Push disabled: VAPID_SUBJECT must be a mailto: or https: URI.')
    return null
  }
  return { publicKey, privateKey, subject, publicRaw, privateRaw }
}

export function isPushConfigured() {
  return Boolean(getVapidConfig())
}

export function getVapidPublicKey() {
  return getVapidConfig()?.publicKey || null
}

function vapidAuthorization(endpoint, config) {
  const audience = new URL(endpoint).origin
  const now = Math.floor(Date.now() / 1000)
  const header = base64UrlEncode(JSON.stringify({ typ: 'JWT', alg: 'ES256' }))
  const claims = base64UrlEncode(JSON.stringify({
    aud: audience,
    exp: now + 12 * 60 * 60,
    sub: config.subject,
  }))
  const unsigned = `${header}.${claims}`
  const x = base64UrlEncode(config.publicRaw.subarray(1, 33))
  const y = base64UrlEncode(config.publicRaw.subarray(33, 65))
  const d = base64UrlEncode(config.privateRaw)
  const privateKey = createPrivateKey({
    format: 'jwk',
    key: { kty: 'EC', crv: 'P-256', x, y, d },
  })
  const signature = sign('sha256', Buffer.from(unsigned), {
    key: privateKey,
    dsaEncoding: 'ieee-p1363',
  })
  return `vapid t=${unsigned}.${base64UrlEncode(signature)}, k=${config.publicKey}`
}

function encryptPayload(subscription, payload) {
  const clientPublic = base64UrlDecode(subscription.p256dh)
  const authSecret = base64UrlDecode(subscription.auth)
  if (clientPublic.length !== 65 || clientPublic[0] !== 4) throw new Error('Invalid push p256dh key.')
  if (authSecret.length < 16) throw new Error('Invalid push auth secret.')

  const server = createECDH('prime256v1')
  server.generateKeys()
  const serverPublic = server.getPublicKey()
  const sharedSecret = server.computeSecret(clientPublic)

  const authPrk = hkdfExtract(authSecret, sharedSecret)
  const keyInfo = Buffer.concat([
    Buffer.from('WebPush: info\0', 'utf8'),
    clientPublic,
    serverPublic,
  ])
  const ikm = hkdfExpand(authPrk, keyInfo, 32)

  const salt = randomBytes(16)
  const prk = hkdfExtract(salt, ikm)
  const cek = hkdfExpand(prk, Buffer.from('Content-Encoding: aes128gcm\0', 'utf8'), 16)
  const nonce = hkdfExpand(prk, Buffer.from('Content-Encoding: nonce\0', 'utf8'), 12)

  const data = Buffer.from(payload, 'utf8')
  if (data.length > MAX_PUSH_PAYLOAD) throw new Error('Push payload is too large.')
  const record = Buffer.concat([data, Buffer.from([2])])

  const cipher = createCipheriv('aes-128-gcm', cek, nonce)
  const encrypted = Buffer.concat([cipher.update(record), cipher.final(), cipher.getAuthTag()])

  const header = Buffer.alloc(21)
  salt.copy(header, 0)
  header.writeUInt32BE(4096, 16)
  header[20] = serverPublic.length
  return Buffer.concat([header, serverPublic, encrypted])
}

function categoryFor(type) {
  const value = String(type || '').toLowerCase()
  if (value.startsWith('marketing_')) return 'marketing'
  if (value.startsWith('live_')) return 'live'
  if (value === 'booking_message') return 'messages'
  if (value === 'booking_offer' || value.includes('negotiat') || value.includes('offer')) return 'negotiations'
  if (
    value.startsWith('escrow_') ||
    value.startsWith('wallet_') ||
    value.startsWith('withdrawal_') ||
    value === 'booking_checkpoint'
  ) return 'payments'
  return 'deals'
}

function isCriticalNotification(type) {
  const value = String(type || '').toLowerCase()
  return (
    value.startsWith('escrow_') ||
    value.startsWith('withdrawal_') ||
    value === 'booking_checkpoint' ||
    value === 'booking_lifecycle' ||
    value === 'booking_dispute'
  )
}

function cleanPreferences(row = {}) {
  return {
    deals: row.deals !== false,
    negotiations: row.negotiations !== false,
    messages: row.messages !== false,
    payments: row.payments !== false,
    live: row.live !== false,
    marketing: row.marketing === true,
  }
}

export async function getPushPreferences(userId) {
  const { rows } = await query(
    `SELECT deals, negotiations, messages, payments, live, marketing
     FROM notification_preferences WHERE user_id = $1`,
    [userId],
  )
  return cleanPreferences(rows[0])
}

export async function updatePushPreferences(userId, next = {}) {
  const current = await getPushPreferences(userId)
  const merged = { ...current }
  for (const key of CATEGORY_KEYS) {
    if (typeof next[key] === 'boolean') merged[key] = next[key]
  }
  const { rows } = await query(
    `INSERT INTO notification_preferences
       (user_id, deals, negotiations, messages, payments, live, marketing, updated_at)
     VALUES ($1,$2,$3,$4,$5,$6,$7,NOW())
     ON CONFLICT (user_id) DO UPDATE SET
       deals = EXCLUDED.deals,
       negotiations = EXCLUDED.negotiations,
       messages = EXCLUDED.messages,
       payments = EXCLUDED.payments,
       live = EXCLUDED.live,
       marketing = EXCLUDED.marketing,
       updated_at = NOW()
     RETURNING deals, negotiations, messages, payments, live, marketing`,
    [userId, merged.deals, merged.negotiations, merged.messages, merged.payments, merged.live, merged.marketing],
  )
  return cleanPreferences(rows[0])
}

function normalizeSubscription(subscription) {
  const endpoint = String(subscription?.endpoint || '').trim()
  const p256dh = String(subscription?.keys?.p256dh || '').trim()
  const auth = String(subscription?.keys?.auth || '').trim()
  if (!/^https:\/\//i.test(endpoint)) throw Object.assign(new Error('Invalid push subscription endpoint.'), { status: 400 })
  if (!p256dh || !auth) throw Object.assign(new Error('Push subscription keys are required.'), { status: 400 })
  if (endpoint.length > 2000 || p256dh.length > 500 || auth.length > 500) {
    throw Object.assign(new Error('Push subscription is too large.'), { status: 400 })
  }
  return { endpoint, p256dh, auth }
}

export async function savePushSubscription(userId, subscription, userAgent = null) {
  const clean = normalizeSubscription(subscription)
  await query(
    `INSERT INTO push_subscriptions
       (user_id, endpoint, p256dh, auth, user_agent, failure_count, updated_at)
     VALUES ($1,$2,$3,$4,$5,0,NOW())
     ON CONFLICT (endpoint) DO UPDATE SET
       user_id = EXCLUDED.user_id,
       p256dh = EXCLUDED.p256dh,
       auth = EXCLUDED.auth,
       user_agent = EXCLUDED.user_agent,
       failure_count = 0,
       updated_at = NOW()`,
    [userId, clean.endpoint, clean.p256dh, clean.auth, String(userAgent || '').slice(0, 500) || null],
  )
  return { ok: true }
}

export async function removePushSubscription(userId, endpoint) {
  const value = String(endpoint || '').trim()
  if (!value) return { ok: true }
  await query('DELETE FROM push_subscriptions WHERE user_id = $1 AND endpoint = $2', [userId, value])
  return { ok: true }
}

async function sendEncryptedPush(subscription, payload, { critical = false, topic = null } = {}) {
  const config = getVapidConfig()
  if (!config) return { skipped: true, reason: 'not_configured' }

  const body = encryptPayload(subscription, JSON.stringify(payload))
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), 8000)
  const headers = {
    Authorization: vapidAuthorization(subscription.endpoint, config),
    'Content-Encoding': 'aes128gcm',
    'Content-Type': 'application/octet-stream',
    TTL: '86400',
    Urgency: critical ? 'high' : 'normal',
  }
  if (topic) headers.Topic = createHash('sha256').update(topic).digest('base64url').slice(0, 24)

  try {
    const response = await fetch(subscription.endpoint, {
      method: 'POST',
      headers,
      body,
      signal: controller.signal,
    })
    return { ok: response.ok, status: response.status }
  } finally {
    clearTimeout(timer)
  }
}

function pushPayload(notification) {
  const metadata = notification.metadata || {}
  const identity = metadata.escrow_id || metadata.application_id || metadata.hat_id || notification.id || ''
  return {
    title: String(notification.title || 'ChombuTar'),
    body: String(notification.body || ''),
    url: String(notification.link_url || '/notifications'),
    type: String(notification.type || 'system'),
    notificationId: notification.id || null,
    tag: `chombutar:${notification.type || 'system'}:${identity}`,
    icon: '/icons/icon-192.png',
    badge: '/icons/icon-192-maskable.png',
  }
}

export async function dispatchStoredNotification(notification) {
  if (!notification?.user_id || !isPushConfigured()) return { delivered: 0, skipped: true }

  try {
    const category = categoryFor(notification.type)
    const critical = isCriticalNotification(notification.type)
    const preferences = await getPushPreferences(notification.user_id)
    if (!critical && preferences[category] === false) {
      return { delivered: 0, skipped: true, reason: 'preference' }
    }

    const { rows: subscriptions } = await query(
      `SELECT id, endpoint, p256dh, auth
       FROM push_subscriptions
       WHERE user_id = $1
       ORDER BY updated_at DESC
       LIMIT 10`,
      [notification.user_id],
    )
    if (!subscriptions.length) return { delivered: 0, skipped: true, reason: 'no_subscription' }

    const payload = pushPayload(notification)
    const results = await Promise.allSettled(
      subscriptions.map(async (subscription) => {
        const result = await sendEncryptedPush(subscription, payload, {
          critical,
          topic: payload.tag,
        })
        if (result.ok) {
          await query(
            `UPDATE push_subscriptions
             SET failure_count = 0, last_success_at = NOW(), updated_at = NOW()
             WHERE id = $1`,
            [subscription.id],
          )
          return true
        }
        if ([404, 410].includes(result.status)) {
          await query('DELETE FROM push_subscriptions WHERE id = $1', [subscription.id])
          return false
        }
        await query(
          `UPDATE push_subscriptions
           SET failure_count = failure_count + 1, updated_at = NOW()
           WHERE id = $1`,
          [subscription.id],
        )
        return false
      }),
    )
    return {
      delivered: results.filter((item) => item.status === 'fulfilled' && item.value === true).length,
      attempted: subscriptions.length,
    }
  } catch (error) {
    console.error('push delivery failed:', error)
    return { delivered: 0, error: true }
  }
}

export async function dispatchStoredNotifications(notifications = []) {
  const rows = Array.isArray(notifications) ? notifications.filter(Boolean) : []
  if (!rows.length) return
  await Promise.allSettled(rows.map((notification) => dispatchStoredNotification(notification)))
}
