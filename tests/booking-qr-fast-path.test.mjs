import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

const read = (path) => readFileSync(new URL(`../${path}`, import.meta.url), 'utf8')

test('QR generation does not wait for push delivery', () => {
  const qr = read('api/_lib/bookingQr.js')
  const start = qr.indexOf('export async function issueBookingQr(')
  const end = qr.indexOf('export async function dispatchBookingQrReadyNotification(')
  assert.ok(start >= 0 && end > start)
  assert.doesNotMatch(qr.slice(start, end), /await dispatchStoredNotifications/)

  const component = read('src/components/DealQrCheckpoint.jsx')
  assert.match(component, /void loadQrCodeModule\(\)\.catch\(\(\) => \{\}\)/)
  assert.match(component, /void api\.notifyBookingQrReady\(booking\.id, stage\)/)
  assert.doesNotMatch(component, /await api\.notifyBookingQrReady/)

  const route = read('api/escrows/[id]/[action].js')
  assert.match(route, /action === 'generate-qr' \|\| action === 'redeem-qr' \|\| action === 'notify-qr-ready'/)
})
