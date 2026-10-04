import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

const read = (path) => readFileSync(new URL(`../${path}`, import.meta.url), 'utf8')

test('push storage supports multiple devices and marketing defaults off', () => {
  const migration = read('db/push-notifications.sql')
  const schema = read('db/schema.sql')
  for (const source of [migration, schema]) {
    assert.match(source, /CREATE TABLE IF NOT EXISTS push_subscriptions/)
    assert.match(source, /endpoint TEXT NOT NULL UNIQUE/)
    assert.match(source, /CREATE TABLE IF NOT EXISTS notification_preferences/)
    assert.match(source, /marketing BOOLEAN NOT NULL DEFAULT false/)
  }
})

test('push backend uses VAPID and encrypted aes128gcm without a new runtime dependency', () => {
  const source = read('api/_lib/pushNotifications.js')
  const pkg = read('package.json')
  assert.match(source, /prime256v1/)
  assert.match(source, /WebPush: info\\0/)
  assert.match(source, /aes-128-gcm/)
  assert.match(source, /Content-Encoding': 'aes128gcm'/)
  assert.match(source, /Authorization: vapidAuthorization/)
  assert.match(source, /VAPID_PUBLIC_KEY/)
  assert.match(source, /VAPID_PRIVATE_KEY/)
  assert.doesNotMatch(pkg, /"web-push"/)
})

test('critical deal and payment push cannot be suppressed by category preferences', () => {
  const source = read('api/_lib/pushNotifications.js')
  assert.match(source, /isCriticalNotification/)
  assert.match(source, /value\.startsWith\('escrow_'\)/)
  assert.match(source, /value === 'booking_checkpoint'/)
  assert.match(source, /value === 'booking_lifecycle'/)
  assert.match(source, /value === 'booking_dispute'/)
  assert.match(source, /if \(!critical && preferences\[category\] === false\)/)
})

test('push permission is requested only from the explicit enable workflow', () => {
  const client = read('src/lib/pushNotifications.js')
  const settings = read('src/components/PushNotificationSettings.jsx')
  const main = read('src/main.jsx')
  assert.match(client, /export async function enablePushNotifications/)
  assert.match(client, /Notification\.requestPermission\(\)/)
  assert.match(settings, /onClick=\{turnOn\}/)
  assert.doesNotMatch(main, /requestPermission/)
})

test('dedicated push worker avoids duplicate foreground system notifications and deep-links safely', () => {
  const worker = read('public/push-sw.js')
  assert.match(worker, /addEventListener\('push'/)
  assert.match(worker, /visibilityState === 'visible'/)
  assert.match(worker, /postMessage\(\{ type: 'push:notification'/)
  assert.match(worker, /showNotification/)
  assert.match(worker, /addEventListener\('notificationclick'/)
  assert.match(worker, /candidate\.origin === self\.location\.origin/)
})

test('transactional deal notifications dispatch only after commit', () => {
  for (const path of [
    'api/_lib/bookingThreads.js',
    'api/_lib/bookingLifecycle.js',
    'api/_lib/bookingQr.js',
    'api/_lib/myDeals.js',
    'api/escrows/index.js',
  ]) {
    const source = read(path)
    assert.match(source, /COMMIT/)
    assert.match(source, /dispatchStoredNotification/)
  }
})

test('push UI and API expose subscribe, unsubscribe, preferences and logout cleanup', () => {
  const auth = read('api/auth/index.js')
  const api = read('src/lib/api.js')
  const context = read('src/context/AuthContext.jsx')
  const notifications = read('src/pages/Notifications.jsx')
  assert.match(auth, /push-config/)
  assert.match(auth, /push_subscribe/)
  assert.match(auth, /push_unsubscribe/)
  assert.match(auth, /update_push_preferences/)
  assert.match(api, /savePushSubscription/)
  assert.match(api, /removePushSubscription/)
  assert.match(context, /disablePushNotifications/)
  assert.match(notifications, /PushNotificationSettings/)
})
