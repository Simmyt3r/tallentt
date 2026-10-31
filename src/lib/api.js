// Path: src/lib/api.js
import { supportedHatMediaMime, MAX_HAT_MEDIA_BYTES } from '../../shared/hatMediaTypes.js'
const base = ''
// Private in-memory route cache: survives tab-to-tab SPA navigation, but is
// neither shared across accounts nor written to the browser's disk. Mutations
// invalidate it. Finance/admin endpoints deliberately opt out.
const responseCache=new Map()
const MAX_CACHE_ITEMS=75
function cacheTtl(path){
  // Only discovery endpoints containing public metadata belong in the
  // in-memory revisit cache. Hat detail responses may expose contact
  // details after escrow unlock; never cache them for offline fallback.
  const target=new URL(path,'https://chombutar.invalid')
  if(target.pathname==='/api/vibes'
     && !target.searchParams.has('moderation_status'))return 30_000
  if(target.pathname==='/api/hats'
     && target.searchParams.get('feed')==='1'
     && !target.searchParams.has('user_id')
     && !target.searchParams.has('my_media'))return 45_000
  if(target.pathname==='/api/showroom'
     && !target.searchParams.has('action')
     && !target.searchParams.has('my_hidden')
     && !target.searchParams.has('visibility'))return 30_000
  return 0
}
export function clearRouteCache(){responseCache.clear()}
export async function request(path,options={}){
  const method=String(options.method||'GET').toUpperCase()
  const ttl=method==='GET'&&options.cache!=='no-store'?cacheTtl(path):0
  const cached=ttl?responseCache.get(path):null
  if(cached && Date.now()-cached.at<ttl)return structuredClone(cached.data)
  try{
    const res=await fetch(`${base}${path}`,{
      credentials:'include',
      headers:{'Content-Type':'application/json',...(options.headers||{})},
      ...options,
    })
    const data=await res.json().catch(()=>({}))
    if(!res.ok){
      const err=new Error(data.error||res.statusText||'Request failed')
      err.status=res.status;err.data=data
      throw err
    }
    if(method!=='GET' && !['presence_heartbeat'].some(action=>String(options.body||'').includes(action))){
      clearRouteCache()
    }
    if(ttl){
      responseCache.set(path,{at:Date.now(),data})
      if(responseCache.size>MAX_CACHE_ITEMS)responseCache.delete(responseCache.keys().next().value)
    }
    return data
  }catch(err){
    // Only recover from network outages, never from real authorization or
    // validation errors. Avoid stale financial data and admin state.
    if(ttl&&cached&&!err.status)return structuredClone(cached.data)
    throw err
  }
}

export const api = {
  // Auth — one consolidated endpoint (api/auth/index.js). Was six separate
  // files (login/logout/me/register/username-check/profile) until that
  // put the deployment over Vercel Hobby's 12-function cap; see the
  // comment at the top of api/auth/index.js.
  me: () => request('/api/auth?action=me'),
  getMyOrbitScore: () => request('/api/auth?action=orbit'),
  getWorkPass: (username) => request('/api/auth?action=work_pass&username='+encodeURIComponent(username),{cache:'no-store'}),
  getWorkPassKey: () => request('/api/auth?action=work_pass_key',{cache:'no-store'}),
  getDealWorkPassEvidence: (id) => request('/api/auth?action=work_pass_deal_evidence&escrow_id='+encodeURIComponent(id),{cache:'no-store'}),
  workPassAction: (body) => request('/api/auth',{method:'POST',body:JSON.stringify(body)}),
  getAdminFinanceSummary: () => request('/api/admin?action=finance_summary',{cache:'no-store'}),
  getAdminLiabilityAudit: (kind,cursor) => request('/api/admin?'+new URLSearchParams({action:'finance_liability_audit',kind,...(cursor?{cursor}:{})}),{cache:'no-store'}),
  getAdminFinanceAudit: (stream,cursor) => request('/api/admin?'+new URLSearchParams({
    action:'finance_audit',stream,...(cursor?{cursor}:{}),
  }),{cache:'no-store'}),
  getAdminOrbitConfig: () => request('/api/admin?action=orbit_config'),
  saveAdminOrbitWeights: (weights) => request('/api/admin',{method:'POST',body:JSON.stringify({action:'configure_orbit',weights})}),
  getAdminHatReviews: () => request('/api/admin?action=hat_data_reviews'),
  submitAdminHatReview: (hat_id,decision,note) => request('/api/admin',{method:'POST',body:JSON.stringify({action:'review_hat_data',hat_id,decision,note})}),
  register: (body) => request('/api/auth', { method: 'POST', body: JSON.stringify({ action: 'register', ...body }) }),
  login: (body) => request('/api/auth', { method: 'POST', body: JSON.stringify({ action: 'login', ...body }) }),
  logout: () => request('/api/auth', { method: 'POST', body: JSON.stringify({ action: 'logout' }) }),
  requestPasswordReset: (email) => request('/api/auth', { method: 'POST', body: JSON.stringify({ action: 'password_reset_request', email }) }),
  completePasswordReset: (token, password) => request('/api/auth', { method: 'POST', body: JSON.stringify({ action: 'password_reset_complete', token, password }) }),
  usernameCheck: (u) => request(`/api/auth?action=username-check&u=${encodeURIComponent(u)}`),
  getPresenceVisibility: () => request('/api/auth?action=presence'),
  heartbeatPresence: () => request('/api/auth',{method:'POST',body:JSON.stringify({action:'presence_heartbeat'})}),
  setPresenceVisibility: (visible) => request('/api/auth',{method:'POST',body:JSON.stringify({action:'presence_visibility',visible})}),
  updateProfile: (body) => request('/api/auth', { method: 'PUT', body: JSON.stringify(body) }),
  getNotifications: (before, search = '', lane = 'all') => request(`/api/auth?action=notifications${before ? `&before=${encodeURIComponent(before)}` : ''}${search ? `&search=${encodeURIComponent(search)}` : ''}&lane=${encodeURIComponent(lane)}`, {cache:'no-store'}),
  deleteNotification: (notificationId) => request('/api/auth', { method: 'PUT', body: JSON.stringify({ action: 'delete_notification', notificationId }) }),
  clearNotifications: () => request('/api/auth', { method: 'PUT', body: JSON.stringify({ action: 'clear_notifications' }) }),
  getNotificationCount: () => request('/api/auth?action=notification-count'),
  getPushConfig: () => request('/api/auth?action=push-config'),
  savePushSubscription: (subscription) =>
    request('/api/auth', {
      method: 'POST',
      body: JSON.stringify({ action: 'push_subscribe', subscription }),
    }),
  removePushSubscription: (endpoint) =>
    request('/api/auth', {
      method: 'POST',
      body: JSON.stringify({ action: 'push_unsubscribe', endpoint }),
    }),
  updatePushPreferences: (preferences) =>
    request('/api/auth', {
      method: 'PUT',
      body: JSON.stringify({ action: 'update_push_preferences', preferences }),
    }),
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
  getMyMedia: () => request('/api/hats?my_media=1'),
  getMyHatReviews: () => request('/api/hats?my_reviews=1'),
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
  updateHatStyle: (id, accent, template, bentoMode = 'standard', flyerPublicId = null) =>
    request(`/api/hats/${id}`, {
      method: 'PATCH',
      body: JSON.stringify({ action: 'set_card_style', accent, template, bentoMode, flyerPublicId }),
    }),
  deleteHat: (id) => request(`/api/hats/${id}`, { method: 'DELETE' }),
  recordView: (id) =>
  request(`/api/hats/${id}`, { method: 'PATCH', body: JSON.stringify({ action: 'view' }) }),
  toggleLike: (id) =>
  request(`/api/hats/${id}`, { method: 'PATCH', body: JSON.stringify({ action: 'like' }) }),
  getAdminVibesVideos: () => request('/api/admin?action=vibes_video_review'),
  moderateVibesVideo: (post_id,decision) => request('/api/admin',{
    method:'POST',body:JSON.stringify({action:'vibes_video_decision',post_id,decision}),
  }),
  getVibeModerationStatus: (postId) => request(`/api/vibes?moderation_status=${encodeURIComponent(postId)}`,{cache:'no-store'})
    .then(result=>{if(result.status==='visible')clearRouteCache();return result}),
  getVibes: (before, post, search = '') => request(`/api/vibes?${new URLSearchParams({
    ...(before ? { before } : {}), ...(post ? { post } : {}),...(search ? {search} : {}),
  })}`),
  getVibeReplies: (postId, before, parentId=null) => request(`/api/vibes?${new URLSearchParams({
    comments: postId, ...(before ? { before } : {}), ...(parentId ? {parent_id:parentId} : {}),
  })}`,{cache:'no-store'}),
  getVibeLikers: (postId,page=0) => request('/api/vibes?'+new URLSearchParams({
    likers:postId,page:String(page),
  }),{cache:'no-store'}),
  publishVibe: (text, media = []) => request('/api/vibes', {
    method: 'POST', body: JSON.stringify({ action: 'publish', text, media }),
  }),
  vibeAction: (body) => request('/api/vibes', { method: 'POST', body: JSON.stringify(body) }),
  getGalleryPost: (postId) => request(`/api/showroom?action=gallery_post&post_id=${encodeURIComponent(postId)}`),
  getGalleryFeed: (options = {}) => request(`/api/showroom?${new URLSearchParams({
    action:'gallery_feed',...Object.fromEntries(Object.entries(options).filter(([,v])=>v!=null && v!==''))
  })}`),
  getMyGalleryPosts: () => request('/api/showroom?action=gallery_mine'),
  publishGalleryPost: (media, caption) => request('/api/showroom', {
    method:'POST',body:JSON.stringify({action:'gallery_publish',media,caption}),
  }),
  galleryAction: (action, post_id, extra = {}) => request('/api/showroom', {
    method:'POST',body:JSON.stringify({action,post_id,...extra}),
  }),
  getAdminGalleryQueue: () => request('/api/admin?action=gallery_review'),
  moderateGalleryPost: (post_id, decision) => request('/api/admin', {
    method:'POST',body:JSON.stringify({action:'review_gallery',post_id,decision}),
  }),
  getShowroomLikers: (postId,kind,page=0) => request('/api/showroom?'+new URLSearchParams({
    action:'likers',post_id:postId,kind,page:String(page),
  }),{cache:'no-store'}),
  getShowroom: (options = {}) => {
    const params = new URLSearchParams()
    for (const key of ['view', 'category', 'search', 'cursor']) {
      if (options[key]) params.set(key, String(options[key]))
    }
    return request(`/api/showroom?${params.toString()}`)
  },
  removeOwnShowroomPost: (hat_id) => request('/api/showroom', {
    method: 'POST', body: JSON.stringify({ action: 'remove_own', hat_id }),
  }),
  restoreOwnShowroomPost: (hat_id) => request('/api/showroom', {
    method: 'POST', body: JSON.stringify({ action: 'restore_own', hat_id }),
  }),
  getMyHiddenShowroomPosts: () => request('/api/showroom?action=my_hidden'),
  getShowroomVisibility: (hat_id) =>
    request(`/api/showroom?action=visibility&hat_id=${encodeURIComponent(hat_id)}`),
  reportShowroom: (hat_id, reason) => request('/api/showroom', {
    method: 'POST', body: JSON.stringify({ action: 'report', hat_id, reason }),
  }),
  getMyShowroomModeration: () => request('/api/showroom?action=my_moderation'),
  submitShowroomAppeal: (hat_id, explanation) => request('/api/showroom', {
    method: 'POST', body: JSON.stringify({ action: 'appeal', hat_id, explanation }),
  }),
  getAdminShowroomAppeals: () => request('/api/admin?action=showroom_appeals'),
  resolveAdminShowroomAppeal: (appealId, decision, note = '') => request('/api/admin', {
    method: 'POST', body: JSON.stringify({ action: 'resolve_showroom_appeal', appealId, decision, note }),
  }),
  getAdminScreeningConfig: () => request('/api/admin?action=showroom_screening_config'),
  getAdminScreeningOps: () => request('/api/admin?action=showroom_screening_ops'),
  getAdminShowroomPreflight: () => request('/api/admin?action=showroom_preflight'),
  testAdminShowroomCloudinary: () => request('/api/admin', {
    method: 'POST', body: JSON.stringify({ action: 'test_showroom_cloudinary' }),
  }),
  testAdminShowroomVision: () => request('/api/admin', {
    method: 'POST', body: JSON.stringify({ action: 'test_showroom_vision' }),
  }),
  runAdminShowroomScreening: () => request('/api/admin', {
    method: 'POST', body: JSON.stringify({ action: 'run_showroom_screening' }),
  }),
  retryAdminShowroomMedia: (mediaId) => request('/api/admin', {
    method: 'POST', body: JSON.stringify({ action: 'retry_showroom_media', mediaId }),
  }),
  saveAdminScreeningConfig: (settings) => request('/api/admin', {
    method: 'POST', body: JSON.stringify({ action: 'save_showroom_screening_config', settings }),
  }),
  generateAdminScreeningWorkerSecret: () => request('/api/admin', {
    method: 'POST', body: JSON.stringify({ action: 'generate_showroom_worker_secret' }),
  }),
  getAdminShowroomMedia: () => request('/api/admin?action=showroom_media'),
  resolveAdminShowroomMedia: (mediaId, decision) => request('/api/admin', {
    method: 'POST', body: JSON.stringify({ action: 'resolve_showroom_media', mediaId, decision }),
  }),
  getAdminShowroomReports: () => request('/api/admin?action=showroom_reports'),
  resolveAdminShowroomReport: (hatId, decision) => request('/api/admin', {
    method: 'POST', body: JSON.stringify({ action: 'resolve_showroom_report', hatId, decision }),
  }),
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
  notifyBookingQrReady: (id, stage) => request(`/api/escrows/${id}/notify-qr-ready`, { method: 'POST', body: JSON.stringify({ stage }) }),
  redeemBookingQr: (id, token) => request(`/api/escrows/${id}/redeem-qr`, { method: 'POST', body: JSON.stringify({ token }) }),
  hideConversation: (escrow_id) => request('/api/escrows', { method: 'POST', body: JSON.stringify({ action: 'hide_conversation', escrow_id }) }),
  hideInboxThread: (kind, thread_id) => request('/api/escrows', {method:'POST',body:JSON.stringify({action:'inbox_hide_thread',kind,thread_id})}),
  getDealCall: (escrow_id,after=0) => request(`/api/escrows?${new URLSearchParams({
    deal_call:'1',escrow_id,after:String(after),
  })}`),
  dealCallAction: (body) => request('/api/escrows',{
    method:'POST',body:JSON.stringify(body),
  }),
  getAssociates: (username) => request('/api/escrows?associates='+encodeURIComponent(username),{cache:'no-store'}),
  getAssociatePrivacy: () => request('/api/escrows?associate_privacy=1',{cache:'no-store'}),
  getContentPrivacy:()=>request('/api/escrows?content_privacy=1',{cache:'no-store'}),
  updateContentPrivacy:(field,value)=>request('/api/escrows',{method:'POST',body:JSON.stringify({action:'content_privacy',field,value})}),
  associateAction: (body) => request('/api/escrows',{method:'POST',body:JSON.stringify(body)}),
  getCommunityChats: () => request('/api/escrows?community=1',{cache:'no-store'}),
  getEmploymentChats: () => request('/api/escrows?employment=1',{cache:'no-store'}),
  getReviewJobs: (id) => request('/api/escrows?review_jobs='+encodeURIComponent(id),{cache:'no-store'}),
  reviewAction: (body) => request('/api/escrows',{method:'POST',body:JSON.stringify(body)}),
  getEmployment: (id) => request('/api/escrows?employment_id='+encodeURIComponent(id),{cache:'no-store'}),
  employmentAction: (body) => request('/api/escrows',{method:'POST',body:JSON.stringify(body)}),
  searchCommunityUsers: (q) => request('/api/escrows?community_users=1&q='+encodeURIComponent(q),{cache:'no-store'}),
  getCommunityThread: (id) => request('/api/escrows?community_thread='+encodeURIComponent(id),{cache:'no-store'}),
  communityChatAction: (body) => request('/api/escrows',{method:'POST',body:JSON.stringify(body)}),
  getConversations: (before) => request(`/api/escrows?conversations=1${before ? `&before=${encodeURIComponent(before)}` : ''}`, { cache: 'no-store' }),
  getNegotiations: (before) => request(`/api/escrows?negotiations=1${before ? `&before=${encodeURIComponent(before)}` : ''}`, { cache: 'no-store' }),
  getMessages: (id, before) => request(`/api/escrows?messages=1&escrow_id=${encodeURIComponent(id)}${before ? `&before=${encodeURIComponent(before)}` : ''}`, { cache: 'no-store' }),
  getBookingHistory: (id, before) => request(`/api/escrows?messages=1&escrow_id=${encodeURIComponent(id)}&events_before=${encodeURIComponent(before)}`, { cache: 'no-store' }),
  messageAction: (body) => request('/api/escrows', { method: 'POST', body: JSON.stringify(body) }),

  // Wallet — reuses the /api/escrows endpoint with a query param / action
  // field rather than a dedicated /api/wallet one (see api/escrows/index.js
  // and the 12-function-cap note next to getMyApplications below).
  getBilling:()=>request('/api/escrows?billing=1',{cache:'no-store'}),
  billingAction:(body)=>request('/api/escrows',{method:'POST',body:JSON.stringify(body)}),
  getAdminBilling:()=>request('/api/admin?action=billing_admin',{cache:'no-store'}),
  adminBillingAction:(body)=>request('/api/admin',{method:'POST',body:JSON.stringify(body)}),
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
  getMyDisputes: () => request('/api/escrows?my_disputes=1'),
  getMyDealsCount: () => request('/api/escrows?deals_count=1'),
  getLandingContext: () => request('/api/escrows?landing_context=1'),
  getMyDealsPage: (role, tab, before) => request(`/api/escrows?deals=1&role=${encodeURIComponent(role)}&tab=${encodeURIComponent(tab)}${before ? `&before=${encodeURIComponent(before)}` : ''}`, { cache: 'no-store' }),
  getDealDetail: (id) => request(`/api/escrows?messages=1&escrow_id=${encodeURIComponent(id)}`, { cache: 'no-store' }),
  respondToBooking: (escrowId, status) =>
    request('/api/escrows', {
      method: 'POST',
      body: JSON.stringify({ action: 'respond_booking', escrow_id: escrowId, status }),
    }),

  // Admin — one consolidated endpoint to stay within Vercel Hobby's
  // function cap while still giving operations a real control panel.
  getAdminDashboard: () => request('/api/admin'),
  searchAdminUsers: (q) => request(`/api/admin?action=user_search&q=${encodeURIComponent(q)}`),
  getUserErasurePreview: (user_id) => request(`/api/admin?action=user_erasure_preview&user_id=${encodeURIComponent(user_id)}`),
  eraseSubscriber: (user_id,confirmation) => request('/api/admin',{
    method:'POST',body:JSON.stringify({action:'erase_subscriber',user_id,confirmation}),
  }),
  getUserMediaErasureStatus: () => request('/api/admin?action=user_erasure_media'),
  retryUserMediaErasure: () => request('/api/admin',{
    method:'POST',body:JSON.stringify({action:'retry_user_media_erasure'}),
  }),
  getAdminMigrations: () => request('/api/admin?action=db_migrations'),
  getAdminWorkPassSigning: () => request('/api/admin?action=work_pass_signing',{cache:'no-store'}),
  activateAdminWorkPassSigning: () => request('/api/admin',{method:'POST',body:JSON.stringify({action:'activate_work_pass_signing'})}),
  rotateAdminWorkPassSigning: () => request('/api/admin',{method:'POST',body:JSON.stringify({action:'rotate_work_pass_signing',confirmation:'ROTATE WORK PASS KEY'})}),
  applyAdminMigration: (migrationId, checksum) => request('/api/admin', {
    method: 'POST',
    body: JSON.stringify({ action: 'apply_db_migration', migrationId, checksum, confirm: `APPLY ${migrationId}` }),
  }),
  getAdminPushConfig: () => request('/api/admin?action=push_config'),
  generateAdminVapid: (subject) => request('/api/admin', {
    method: 'POST',
    body: JSON.stringify({ action: 'generate_vapid', subject }),
  }),
  updateAdminVapidSubject: (subject) => request('/api/admin', {
    method: 'POST',
    body: JSON.stringify({ action: 'update_vapid_subject', subject }),
  }),
  getDisputes: (status, before) => request(`/api/admin?action=disputes&status=${status}${before ? `&before=${encodeURIComponent(before)}` : ''}`),
  getDispute: (id, before, eventsBefore) => request(`/api/admin?action=dispute&escrow_id=${encodeURIComponent(id)}${before ? `&before=${encodeURIComponent(before)}` : ''}${eventsBefore ? `&events_before=${encodeURIComponent(eventsBefore)}` : ''}`),
  getLiveDisputes: () => request('/api/admin?action=live_disputes'),
  adminAction: (body) => request('/api/admin', { method: 'POST', body: JSON.stringify(body) }),

  // ChombuTar Live — MediaMTX media transport + Vercel metadata/actions.
  getStageCompetitions: () => request('/api/live?stage_competitions=1'),
  getStageCompetition: (id) => request(`/api/live?stage_competition=${encodeURIComponent(id)}`),
  getMyCompetitionStreams: () => request('/api/live?stage_streams=1'),
  stageAction: (body) => request('/api/live', {method:'POST',body:JSON.stringify(body)}),
  getLiveMediaStatus: () => request('/api/live?media_status=1'),
  getLiveRooms: (status) => request(`/api/live${status ? `?status=${encodeURIComponent(status)}` : ''}`),
  getLiveRoom: (roomId) => request(`/api/live?room_id=${encodeURIComponent(roomId)}`),
  liveAction: (body) => request('/api/live', { method: 'POST', body: JSON.stringify(body) }),
}

export const MAX_UPLOAD_BYTES = MAX_HAT_MEDIA_BYTES
export const ALLOWED_UPLOAD_PREFIXES = ['image/', 'video/', 'audio/']

// Returns a user-facing message when `file` can't be uploaded, else ''.
// Exported so callers can reject a file before spending any bandwidth on it.
export function validateUploadFile(file) {
  if (!file) return 'Choose a file to upload.'
  if (file.size > MAX_UPLOAD_BYTES) return 'File is too large. Upload a file of 20MB or less.'
  if (!supportedHatMediaMime(file.type)) {
    return 'Unsupported format. Use JPG, PNG, WebP, GIF, AVIF, MP4, WebM, MOV, MP3, WAV, OGG or M4A.'
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

  // Ask the authenticated backend to issue a user-bound, short-lived
  // Cloudinary signature. The legacy unsigned preset is a temporary fallback
  // ONLY while the explicit server rollout flag remains off.
  const permit = await request('/api/hats', {
    method: 'POST',
    body: JSON.stringify({ action: 'upload_sign', mime: file.type, bytes: file.size }),
  })
  const signed = permit?.enabled === true
  const cloud = signed ? permit.cloudName : import.meta.env.VITE_CLOUDINARY_CLOUD_NAME
  const preset = import.meta.env.VITE_CLOUDINARY_UPLOAD_PRESET
  const folder = import.meta.env.VITE_CLOUDINARY_FOLDER || 'chombutar_hats'
  if (!cloud || (!signed && !preset)) throw new Error('Cloudinary upload is not configured')

  const fd = new FormData()
  fd.append('file', file)
  if (signed) {
    fd.append('api_key', permit.apiKey)
    fd.append('signature', permit.signature)
    for (const [key, value] of Object.entries(permit.params)) fd.append(key, String(value))
  } else {
    fd.append('upload_preset', preset)
    fd.append('folder', folder)
  }

  const endpoint = `https://api.cloudinary.com/v1_1/${cloud}/auto/upload`
  let data
  if (options.onProgress || options.signal) {
    data = await xhrUpload(endpoint, fd, options)
  } else {
    const res = await fetch(endpoint, { method: 'POST', body: fd })
    data = await res.json().catch(() => ({}))
    if (!res.ok) throw new Error(data.error?.message || 'Upload failed')
  }
  if (signed && (data.public_id !== permit.params.public_id ||
      data.resource_type !== permit.resourceType || !data.secure_url)) {
    throw new Error('Cloudinary returned media that did not match your upload authorization.')
  }
  return {
    url: data.secure_url,
    public_id: data.public_id,
    // Cloudinary stores audio under the video resource type. Preserve the
    // user's audio identity in Hat metadata for correct playback/review.
    type: file.type?.startsWith('audio/') ? 'audio' : (data.resource_type || 'image'),
    ...(signed ? { upload_id: permit.permitId } : {}),
  }
}

// Independent gallery media is always signed; never use the legacy unsigned preset.
export async function uploadGalleryMedia(file) {
  const issue=validateUploadFile(file)
  if(issue) throw new Error(issue)
  if(!new Set(['image/jpeg','image/png','image/webp','image/gif','image/avif',
    'video/mp4','video/webm','video/quicktime']).has(file.type))
    throw new Error('Choose a supported photo or video (up to 20 MB).')
  const permit=await request('/api/showroom',{
    method:'POST',body:JSON.stringify({action:'gallery_sign',mime:file.type,bytes:file.size}),
  })
  if (!permit.enabled) throw new Error('Signed gallery uploads are not enabled.')
  const fd=new FormData()
  fd.append('file',file)
  fd.append('api_key',permit.apiKey)
  fd.append('signature',permit.signature)
  for(const [key,value] of Object.entries(permit.params)) fd.append(key,String(value))
  const response=await fetch(`https://api.cloudinary.com/v1_1/${permit.cloudName}/auto/upload`,{
    method:'POST',body:fd,
  })
  const result=await response.json().catch(()=>({}))
  if(!response.ok) throw new Error(result.error?.message || 'Upload failed.')
  if(result.public_id!==permit.params.public_id ||
      result.resource_type!==permit.resourceType || !result.secure_url)
    throw new Error('Uploaded media did not match the signed authorization.')
  return {url:result.secure_url,public_id:result.public_id,
    type:result.resource_type,upload_id:permit.permitId}
}

// Strict Vibes upload path: signed only, and no unsigned Cloudinary fallback.
export async function uploadVibePhoto(file) {
  const isVideo=file?.type?.startsWith('video/')
  const maxBytes=isVideo?20*1024*1024:8*1024*1024
  if(!file || !(isVideo
    ? ['video/mp4','video/webm','video/quicktime'].includes(file.type)
    : ['image/jpeg','image/png','image/webp'].includes(file.type))
    || file.size<1||file.size>maxBytes)
    throw new Error('Choose JPG/PNG/WebP up to 8MB or MP4/WebM/MOV video up to 20MB.')
  const signed=await api.vibeAction({action:'upload_sign',mime:file.type,bytes:file.size})
  const resourceType=isVideo?'video':'image'
  if(signed.resourceType!==resourceType)throw new Error('Unexpected media authorization.')
  const fd=new FormData()
  fd.append('file',file)
  fd.append('api_key',signed.apiKey)
  fd.append('signature',signed.signature)
  for(const [key,value] of Object.entries(signed.params))fd.append(key,String(value))
  const result=await fetch(`https://api.cloudinary.com/v1_1/${signed.cloudName}/${resourceType}/upload`,{
    method:'POST',body:fd,
  })
  const data=await result.json().catch(()=>({}))
  if(!result.ok)throw new Error(data.error?.message||'Vibes media upload failed.')
  if(data.public_id!==signed.params.public_id||data.resource_type!==resourceType||!data.secure_url)
    throw new Error('Uploaded media does not match the signed authorization.')
  return {upload_id:signed.permitId,public_id:data.public_id,url:data.secure_url,type:resourceType}
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

