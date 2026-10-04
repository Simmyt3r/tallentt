import { api } from './api.js'

const PUSH_SW_URL = '/push-sw.js'
const PUSH_SCOPE = '/push/'

function supported() {
  return typeof window !== 'undefined' &&
    'serviceWorker' in navigator &&
    'PushManager' in window &&
    'Notification' in window
}

function urlBase64ToUint8Array(value) {
  const padding = '='.repeat((4 - (value.length % 4)) % 4)
  const base64 = (value + padding).replace(/-/g, '+').replace(/_/g, '/')
  const raw = atob(base64)
  return Uint8Array.from([...raw].map((char) => char.charCodeAt(0)))
}

async function registration({ create = false } = {}) {
  if (!supported()) return null
  let current = await navigator.serviceWorker.getRegistration(PUSH_SCOPE)
  if (!current && create) {
    current = await navigator.serviceWorker.register(PUSH_SW_URL, { scope: PUSH_SCOPE })
  }
  return current
}

export function getPushSupport() {
  return {
    supported: supported(),
    permission: supported() ? Notification.permission : 'unsupported',
  }
}

export async function getPushState() {
  if (!supported()) return { supported: false, permission: 'unsupported', subscribed: false }
  const reg = await registration()
  const subscription = reg ? await reg.pushManager.getSubscription() : null
  return {
    supported: true,
    permission: Notification.permission,
    subscribed: Boolean(subscription),
    endpoint: subscription?.endpoint || null,
  }
}

export async function enablePushNotifications() {
  if (!supported()) throw new Error('Push notifications are not supported by this browser.')

  const config = await api.getPushConfig()
  if (!config.configured || !config.publicKey) {
    throw new Error('Push notifications are not configured on the server yet.')
  }

  const permission = Notification.permission === 'granted'
    ? 'granted'
    : await Notification.requestPermission()
  if (permission !== 'granted') {
    throw new Error(permission === 'denied'
      ? 'Notifications are blocked in your browser settings.'
      : 'Notification permission was not granted.')
  }

  const reg = await registration({ create: true })
  let subscription = await reg.pushManager.getSubscription()
  if (!subscription) {
    subscription = await reg.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: urlBase64ToUint8Array(config.publicKey),
    })
  }
  await api.savePushSubscription(subscription.toJSON())
  return {
    supported: true,
    permission,
    subscribed: true,
    preferences: config.preferences,
  }
}

export async function syncPushSubscription() {
  if (!supported() || Notification.permission !== 'granted') return false
  try {
    const reg = await registration()
    const subscription = reg ? await reg.pushManager.getSubscription() : null
    if (!subscription) return false
    await api.savePushSubscription(subscription.toJSON())
    return true
  } catch (error) {
    console.error('push subscription sync failed:', error)
    return false
  }
}

export async function disablePushNotifications() {
  if (!supported()) return true
  const reg = await registration()
  const subscription = reg ? await reg.pushManager.getSubscription() : null
  if (!subscription) return true

  try {
    await api.removePushSubscription(subscription.endpoint)
  } catch (error) {
    console.error('push unsubscribe API failed:', error)
  }
  await subscription.unsubscribe().catch(() => false)
  return true
}

let bridgeInstalled = false
export function installPushMessageBridge() {
  if (!supported() || bridgeInstalled) return
  bridgeInstalled = true
  navigator.serviceWorker.addEventListener('message', (event) => {
    if (event.data?.type !== 'push:notification') return
    window.dispatchEvent(new CustomEvent('push:notification', { detail: event.data.notification || null }))
    window.dispatchEvent(new CustomEvent('mydeals:changed'))
  })
}
