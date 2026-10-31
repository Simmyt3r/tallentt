import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

const read = (path) => readFileSync(new URL(`../${path}`, import.meta.url), 'utf8')

test('My Deals replaces split application/booking navigation', () => {
  const nav = read('src/lib/nav.js')
  const app = read('src/App.jsx')
  assert.match(nav, /to: '\/deals'.*label: 'My Deals'/)
  assert.doesNotMatch(nav, /label: 'Applications'/)
  assert.doesNotMatch(nav, /label: 'Bookings'/)
  assert.match(app, /path="\/deals"/)
  assert.match(app, /my-applications".*deals\?role=talent&tab=outgoing/)
  assert.match(app, /my-bookings".*deals\?role=client&tab=outgoing/)
})

test('mobile nav keeps exactly Showroom, Bento, Vibes, Inbox and Profile', () => {
  const source = read('src/components/BottomNav.jsx')
  const items = [...source.matchAll(/<BottomNavLink to="([^"]+)"/g)].map(x=>x[1])
  assert.deepEqual(items,['/showroom','/bento','/vibes','/inbox','/profile'])
  assert.match(source, /badge=\{unreadBento\}/)
})

test('My Deals page is URL-driven, paginated, and includes permanent History', () => {
  const source = read('src/pages/MyDeals.jsx')
  for (const phrase of [
    'Talent',
    'Client',
    'Incoming',
    'Outgoing',
    'Active',
    'History',
    'Deal history',
    'Load older',
  ]) assert.ok(source.includes(phrase), phrase)
  assert.match(source, /useSearchParams/)
  assert.match(source, /setView/)
  assert.match(source, /getMyDealsPage\(role, tab/)
  assert.match(source, /\/deals\/\$\{item\.id\}/)
  assert.doesNotMatch(source, /DealQrCheckpoint/)
  assert.doesNotMatch(source, /EscrowFundingCard/)
  assert.doesNotMatch(source, /BookingProgress/)
  assert.doesNotMatch(source, /role="dialog"/)
  assert.doesNotMatch(source, /sticky top-0/)
})

test('My Deals and Notifications are routed as full pages instead of layout overlays', () => {
  const app = read('src/App.jsx')
  const layout = read('src/components/Layout.jsx')
  const notifications = read('src/pages/Notifications.jsx')
  const bell = read('src/components/NotificationsMenu.jsx')

  assert.match(app, /path="\/deals".*<MyDeals/)
  assert.match(app, /path="\/deals\/:dealId".*<DealDetails/)
  assert.match(app, /path="\/notifications".*<Notifications/)
  assert.doesNotMatch(layout, /location\.pathname === '\/deals'/)
  assert.doesNotMatch(layout, /MyDealsModal/)
  assert.match(bell, /to="\/notifications"/)
  assert.doesNotMatch(bell, /role="dialog"/)
  assert.match(notifications, /Notification list/)
  assert.match(notifications, /Mark all read/)
})

test('deal workspace owns payment, QR, delivery, disputes and booking history', () => {
  const detail = read('src/pages/DealDetails.jsx')
  const app = read('src/App.jsx')
  assert.match(app, /path="\/deals\/:dealId"/)
  assert.match(detail, /EscrowFundingCard/)
  assert.match(detail, /DealQrCheckpoint/)
  assert.match(detail, /BookingProgress/)
  assert.match(detail, /getDealDetail/)
  assert.match(detail, /Open deal chat/)
  assert.match(detail, /Escrow/)
  assert.match(detail, /showHistory/)
})

test('badges and notification history use lightweight paginated APIs', () => {
  const api = read('src/lib/api.js')
  const bell = read('src/components/NotificationsMenu.jsx')
  const bottom = read('src/components/BottomNav.jsx')
  const notifications = read('src/pages/Notifications.jsx')
  const server = read('api/_lib/notifications.js')
  const deals = read('api/_lib/myDeals.js')

  assert.match(api, /getNotificationCount/)
  assert.match(api, /getMyDealsCount/)
  assert.match(bell, /getNotificationCount/)
  assert.match(read('src/components/Layout.jsx'), /Open Inbox/)
  assert.match(notifications, /Load older/)
  assert.match(server, /nextCursor/)
  assert.match(server, /LIMIT \$3/)
  assert.match(deals, /getMyDealsPage/)
  assert.match(deals, /pageSize = 30/)
})

test('acceptance and settled negotiation are required before wallet escrow funding', () => {
  const checkout = read('api/_lib/bookingCheckout.js')
  const payments = read('api/_lib/escrowPayments.js')
  const rules = read('api/_lib/bookingRules.js')
  const dealsUi = read('src/pages/DealDetails.jsx')
  const fundingUi = read('src/components/EscrowFundingCard.jsx')
  assert.match(checkout, /must accept this booking request before payment/)
  assert.match(checkout, /Agree the final price in Negotiation Center before funding escrow/)
  assert.match(checkout, /type: 'escrow_fund'/)
  assert.match(payments, /applyVerifiedLegacyBookingCharge/)
  assert.match(dealsUi, /EscrowFundingCard/)
  assert.match(fundingUi, /Fund escrow/)
  assert.match(fundingUi, /Wallet balance/)
  assert.match(fundingUi, /You need/)
  assert.doesNotMatch(dealsUi, /Pay with card/)
  assert.match(rules, /contacts_unlocked === true/)
  assert.match(rules, /!\['cancelled', 'refunded'\]\.includes/)
})

test('escrow shortfall opens a prefilled wallet top-up and returns to the deal', () => {
  const funding = read('src/components/EscrowFundingCard.jsx')
  const wallet = read('src/pages/Wallet.jsx')
  assert.match(funding, /You need/)
  assert.match(funding, /\/wallet\?topup=/)
  assert.match(funding, /return=/)
  assert.match(wallet, /useSearchParams/)
  assert.match(wallet, /initialTopup/)
  assert.match(wallet, /navigate\(returnTo\)/)
})

test('server emits myDeals invalidations and promotes accepted applications into active escrows', () => {
  const deals = read('api/_lib/myDeals.js')
  assert.match(deals, /emitLiveEvent\(userId, 'myDeals'/)
  assert.match(deals, /application_id, request_kind, currency, pay_unit, agreed_at/)
  assert.match(deals, /type: 'booking_accepted'/)
  assert.match(deals, /type: `application_\$\{status\}`/)
  assert.match(deals, /Agree the Range price before accepting this application/)
  assert.match(deals, /negotiation_escrow_id/)
})

test('deal action buttons update confirmed state before background reconciliation', () => {
  const list = read('src/pages/MyDeals.jsx')
  const detail = read('src/pages/DealDetails.jsx')
  const progress = read('src/components/BookingProgress.jsx')
  assert.match(list, /function confirmListChange/)
  assert.match(list, /confirmListChange\(item, status === 'accepted'/)
  assert.match(list, /requestSequence\.current/)
  assert.match(list, /void load\(\{ quiet: true \}\)/)
  assert.doesNotMatch(list, /await load\(\{ quiet: true \}\)/)
  assert.match(detail, /const result = await operation\(\)/)
  assert.match(detail, /thread: \{ \.\.\.current\.thread, \.\.\.result\.escrow \}/)
  assert.match(detail, /void refreshUser\(\)/)
  assert.match(detail, /onComplete=\{\(result\) => run\(\(\) => Promise\.resolve\(result\)\)\}/)
  assert.doesNotMatch(detail, /await refreshUser\(\)/)
  assert.match(progress, /await run\(\(\) => api\.bookingAction/)
  assert.doesNotMatch(progress, /await refreshUser\(\)/)
})
