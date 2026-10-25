import test from 'node:test'
import assert from 'node:assert/strict'
import {readFileSync} from 'node:fs'
import {
  notificationLane,notificationLaneSql,notificationUrgency,
  notificationDigestLane,isNoisyNotification,NOTIFICATION_LANES,
} from '../api/_lib/notificationPriority.js'

const read=path=>readFileSync(new URL('../'+path,import.meta.url),'utf8')

test('only four categories, with monetary records and paid-work action separated',()=>{
  assert.deepEqual(NOTIFICATION_LANES,['bento','money','associates','fame'])
  for(const type of ['booking_requested','booking_accepted','booking_dispute','application_received','booking_message'])
    assert.equal(notificationLane(type),'bento')
  for(const type of ['escrow_released','wallet_topup','withdrawal_failed','live_tip_received','job_split_paid'])
    assert.equal(notificationLane(type),'money')
  for(const type of ['associate_request','associate_response','community_message'])
    assert.equal(notificationLane(type),'associates')
  for(const type of ['vibes_first_ten','vibes_reply','orbit_level_up','showroom_top12','verification_approved'])
    assert.equal(notificationLane(type),'fame')
})

test('Bento and money push uses high priority; Fame uses scheduled group delivery',()=>{
  assert.equal(notificationUrgency('booking_requested'),'high')
  assert.equal(notificationUrgency('withdrawal_failed'),'high')
  assert.equal(notificationUrgency('associate_request'),'normal')
  assert.equal(notificationDigestLane('vibes_reply'),'fame')
  assert.equal(notificationDigestLane('showroom_top12'),'fame')
  assert.equal(notificationDigestLane('orbit_level_up'),'fame')
  assert.equal(notificationDigestLane('booking_message'),null)
})

test('views, every like and generic comeback reminders are not notification events',()=>{
  for(const type of ['vibes_like','vibes_view','showroom_like','showroom_view','profile_view','generic_comeback'])
    assert.equal(isNoisyNotification(type),true)
  assert.equal(isNoisyNotification('vibes_first_ten'),false)
})

test('server-side lane SQL requires a fixed alias; it cannot embed user input',()=>{
  const sql=notificationLaneSql('n')
  assert.match(sql,/CASE/)
  assert.match(sql,/THEN 'money'/)
  assert.match(sql,/THEN 'bento'/)
  assert.throws(()=>notificationLaneSql('n;DROP TABLE notifications'),/Invalid/)
})

test('notification pages filter and paginate by lane at the database, not client page',()=>{
  const backend=read('api/_lib/notifications.js')
  const ui=read('src/pages/Notifications.jsx')
  assert.match(backend,/AND \(\$5::text = 'all' OR/)
  assert.match(backend,/n\.user_id = \$1/)
  assert.match(backend,/getNotificationUnreadByLane/)
  assert.match(ui,/\['bento','Bento'\]/)
  assert.match(ui,/\['money','Money'\]/)
  assert.match(ui,/\['associates','Associates'\]/)
  assert.match(ui,/\['fame','Fame'\]/)
})

test('critical categories cannot be muted and browser push permission is never forced',()=>{
  const settings=read('src/components/PushNotificationSettings.jsx')
  const backend=read('api/_lib/pushNotifications.js')
  const client=read('src/lib/pushNotifications.js')
  assert.match(backend,/REQUIRED_CATEGORIES/)
  assert.match(backend,/deals: true/)
  assert.match(backend,/payments: true/)
  assert.match(backend,/vibes_mode: row\.vibes_mode === 'off' \? 'off' : 'digest'/)
  assert.match(settings,/Daily digest/)
  assert.match(settings,/disabled=\{required\}/)
  assert.match(client,/Notification\.requestPermission\(\)/)
})

test('daily digest is Vercel-scheduled, secret-guarded and idempotent',()=>{
  const vercel=JSON.parse(read('vercel.json'))
  assert.deepEqual(vercel.crons,[{path:'/api/auth?action=daily-notification-digest',schedule:'0 6 * * *'}])
  const auth=read('api/auth/index.js')
  const worker=read('api/_lib/notificationDigest.js')
  const migration=read('db/patch-notification-priorities-2026-10.sql')
  assert.match(auth,/process\.env\.CRON_SECRET/)
  assert.match(worker,/notification_daily_digests/)
  assert.match(worker,/ON CONFLICT DO NOTHING RETURNING user_id/)
  assert.match(worker,/COALESCE\(p\.vibes_mode,'digest'\)='digest'/)
  assert.match(migration,/PRIMARY KEY \(user_id,digest_day\)/)
})

test('notification payload retains recipient and schedules only first ten likes',()=>{
  const notification=read('api/_lib/notifications.js')
  const vibes=read('api/vibes/index.js')
  assert.match(notification,/RETURNING id, user_id, type/)
  assert.match(vibes,/Number\(count\.likes\)===10/)
  assert.match(vibes,/NOT EXISTS\(SELECT 1 FROM notifications/)
  assert.match(vibes,/is_verified=TRUE/)
  assert.match(vibes,/associate_links/)
})
