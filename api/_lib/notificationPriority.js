// Four ChombuTar inbox lanes based on recorded event types. The SQL and JS
// rules are intentionally equivalent: filters and badge colours must agree.
export const NOTIFICATION_LANES = Object.freeze(['bento','money','associates','fame'])

export function notificationLane(type) {
  const value = String(type || '').toLowerCase()
  if (/^(salary_|escrow_|wallet_|withdrawal_|payment_|audio_money_|tip_|gift_|job_split_|live_tip_|live_gift_)/.test(value)) return 'money'
  if (/^(associate_|community_)/.test(value)) return 'associates'
  if (/^(employment_|booking_|application_|admin_application_|deal_|negotiat_)/.test(value)) return 'bento'
  return 'fame'
}

export function notificationLaneSql(alias = 'n') {
  // Static, internal aliases only. Never accept a browser-provided identifier.
  if (!['n', 'notifications'].includes(alias)) throw new Error('Invalid notification table alias.')
  const type = `LOWER(${alias}.type)`
  return `CASE
    WHEN ${type} ~ '^(salary_|escrow_|wallet_|withdrawal_|payment_|audio_money_|tip_|gift_|job_split_|live_tip_|live_gift_)' THEN 'money'
    WHEN ${type} ~ '^(associate_|community_)' THEN 'associates'
    WHEN ${type} ~ '^(employment_|booking_|application_|admin_application_|deal_|negotiat_)' THEN 'bento'
    ELSE 'fame'
  END`
}

export function isNoisyNotification(type) {
  return /^(vibes_like|vibes_view|showroom_like|showroom_view|profile_view|generic_comeback|marketing_comeback)$/.test(String(type||'').toLowerCase())
}

export function notificationUrgency(type) {
  return ['bento','money'].includes(notificationLane(type)) ? 'high' : 'normal'
}

export function notificationDigestLane(type) {
  const value=String(type||'').toLowerCase()
  if (/^(vibes_|showroom_|orbit_|verification_|hat_moderation)/.test(value)) return 'fame'
  return null
}
