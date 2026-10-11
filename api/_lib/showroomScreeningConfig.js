// Server-owned Showroom screening config. Never return secrets in admin GETs.
// Uses a domain-separated AES-256-GCM key derived from an existing server-side
// root. Operators can configure all FOUR screening fields in Admin; the
// encryption root itself must stay outside the database and browser.
import { createHash, createCipheriv, createDecipheriv, randomBytes } from 'node:crypto'
import { getClient, query } from './db.js'
import { signedHatMediaEnabled, uploadCloudCredentials } from './hatMediaUpload.js'

const bad = (message, status = 400) => Object.assign(new Error(message), { status })
const keyName = 'showroom:v1:'
let initialized

function encryptionKey() {
  const secret = process.env.SHOWROOM_CONFIG_ENCRYPTION_KEY || process.env.JWT_SECRET
  if (!secret || String(secret).length < 12) throw bad('The server needs a strong JWT_SECRET or SHOWROOM_CONFIG_ENCRYPTION_KEY.', 503)
  return createHash('sha256').update(keyName + secret).digest()
}
function encrypt(value) {
  const iv = randomBytes(12)
  const cipher = createCipheriv('aes-256-gcm', encryptionKey(), iv)
  const bytes = Buffer.concat([cipher.update(value, 'utf8'), cipher.final()])
  return ['v1', iv.toString('base64'), cipher.getAuthTag().toString('base64'), bytes.toString('base64')].join('.')
}
function decrypt(value) {
  if (!value) return null
  const [version, iv, tag, payload] = value.split('.')
  if (version !== 'v1' || !iv || !tag || !payload) throw bad('Stored screening secrets are unreadable.', 503)
  try {
    const decipher = createDecipheriv('aes-256-gcm', encryptionKey(), Buffer.from(iv, 'base64'))
    decipher.setAuthTag(Buffer.from(tag, 'base64'))
    return Buffer.concat([decipher.update(Buffer.from(payload, 'base64')), decipher.final()]).toString('utf8')
  } catch {
    throw bad('Cannot decrypt screening settings. Restore the original encryption root.', 503)
  }
}
export async function ensureShowroomConfigStorage() {
  if (!initialized) initialized = query(`CREATE TABLE IF NOT EXISTS showroom_screening_config (
    singleton BOOLEAN PRIMARY KEY DEFAULT true CHECK (singleton = true),
    cloud_name TEXT,
    vision_key_encrypted TEXT,
    worker_secret_encrypted TEXT,
    enabled BOOLEAN,
    updated_by UUID REFERENCES users(id) ON DELETE SET NULL,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
  )`).catch(err => { initialized = null; throw err })
  return initialized
}
const validCloud = x => /^[a-z0-9_-]{2,100}$/i.test(x)
const validVisionKey = x => x.length >= 12 && x.length <= 512 && !/\s/.test(x)
const validWorkerSecret = x => x.length >= 24 && x.length <= 512 && !/\s/.test(x)

export async function effectiveScreeningConfig() {
  await ensureShowroomConfigStorage()
  const { rows } = await query('SELECT * FROM showroom_screening_config WHERE singleton = true')
  const row = rows[0]
  const cloudName = row?.cloud_name || process.env.CLOUDINARY_CLOUD_NAME || process.env.VITE_CLOUDINARY_CLOUD_NAME || ''
  const visionKey = row?.vision_key_encrypted ? decrypt(row.vision_key_encrypted) : (process.env.GOOGLE_CLOUD_VISION_API_KEY || '')
  const workerSecret = row?.worker_secret_encrypted ? decrypt(row.worker_secret_encrypted) : (process.env.SHOWROOM_WORKER_SECRET || '')
  const enabled = row?.enabled == null ? process.env.SHOWROOM_MEDIA_SCREENING === 'enforce' : row.enabled
  return {
    cloudName, visionKey, workerSecret, enabled,
    source: row ? 'admin' : 'environment',
    updatedAt: row?.updated_at || null,
    ready: validCloud(cloudName) && validVisionKey(visionKey) && validWorkerSecret(workerSecret),
  }
}
export async function adminScreeningStatus() {
  const config = await effectiveScreeningConfig()
  let uploadCredentialsReady = false
  try { uploadCloudCredentials(); uploadCredentialsReady = true } catch {}
  const { rows: uploadTables } = await query("SELECT to_regclass('hat_media_upload_permits') IS NOT NULL AS installed")
  return {
    signedUploadStatus: {
      enabled: signedHatMediaEnabled(),
      credentialsConfigured: uploadCredentialsReady,
      migrationInstalled: Boolean(uploadTables[0]?.installed),
    },
    cloudName: config.cloudName, enabled: config.enabled, ready: config.ready,
    visionConfigured: validVisionKey(config.visionKey),
    workerConfigured: validWorkerSecret(config.workerSecret),
    cloudConfigured: validCloud(config.cloudName),
    source: config.source, updatedAt: config.updatedAt,
    encryptionRootConfigured: Boolean(process.env.SHOWROOM_CONFIG_ENCRYPTION_KEY || process.env.JWT_SECRET),
  }
}
export async function saveAdminScreeningConfig(adminId, change = {}) {
  if (!change || typeof change !== 'object' || Array.isArray(change)) throw bad('Invalid configuration.')
  const fields = ['cloudName', 'visionKey', 'workerSecret', 'enabled']
  if (Object.keys(change).some(x => !fields.includes(x))) throw bad('Unknown screening setting.')
  if (!Object.keys(change).length) throw bad('Choose a setting to update.')
  const current = await effectiveScreeningConfig()
  const next = { ...current }
  if ('cloudName' in change) {
    if (typeof change.cloudName !== 'string' || !validCloud(change.cloudName.trim())) throw bad('Enter a valid Cloudinary cloud name.')
    next.cloudName = change.cloudName.trim()
  }
  if ('visionKey' in change) {
    if (typeof change.visionKey !== 'string' || !validVisionKey(change.visionKey.trim())) throw bad('Enter a valid Google Cloud Vision API key.')
    next.visionKey = change.visionKey.trim()
  }
  if ('workerSecret' in change) {
    if (typeof change.workerSecret !== 'string' || !validWorkerSecret(change.workerSecret.trim())) throw bad('The worker secret must contain at least 24 non-space characters.')
    next.workerSecret = change.workerSecret.trim()
  }
  if ('enabled' in change) {
    if (typeof change.enabled !== 'boolean') throw bad('Screening enabled must be true or false.')
    next.enabled = change.enabled
  }
  // Never activate when a worker cannot authorize or Vision cannot scan.
  if (next.enabled && !(validCloud(next.cloudName) && validVisionKey(next.visionKey) && validWorkerSecret(next.workerSecret))) {
    throw bad('Configure Cloudinary, Google Vision and a worker secret before enabling screening.', 409)
  }
  // Keep the actual uploader and moderator on the same Cloudinary account.
  const uploadCloud = process.env.VITE_CLOUDINARY_CLOUD_NAME || process.env.CLOUDINARY_CLOUD_NAME
  if (next.enabled && uploadCloud && uploadCloud !== next.cloudName) {
    throw bad('Cloudinary cloud name differs from the configured upload cloud. Update it to match before enabling.', 409)
  }
  // This also verifies that the key remains decryptable before any write.
  encryptionKey()
  const client = await getClient()
  try {
    await client.query('BEGIN')
    // Read row under lock to serialize writes, preventing lost secrets.
    const { rows: existing } = await client.query('SELECT * FROM showroom_screening_config WHERE singleton = true FOR UPDATE')
    const stored = existing[0] || {}
    const encryptedVision = 'visionKey' in change ? encrypt(next.visionKey) : stored.vision_key_encrypted || null
    const encryptedWorker = 'workerSecret' in change ? encrypt(next.workerSecret) : stored.worker_secret_encrypted || null
    await client.query(`INSERT INTO showroom_screening_config
      (singleton, cloud_name, vision_key_encrypted, worker_secret_encrypted, enabled, updated_by, updated_at)
      VALUES (true,$1,$2,$3,$4,$5,NOW()) ON CONFLICT (singleton) DO UPDATE SET
      cloud_name=EXCLUDED.cloud_name, vision_key_encrypted=EXCLUDED.vision_key_encrypted,
      worker_secret_encrypted=EXCLUDED.worker_secret_encrypted, enabled=EXCLUDED.enabled,
      updated_by=EXCLUDED.updated_by, updated_at=NOW()`,
    ['cloudName' in change ? next.cloudName : stored.cloud_name || null, encryptedVision, encryptedWorker,
     'enabled' in change ? next.enabled : stored.enabled ?? null, adminId])
    // Switching enforcement off must not strand already queued media. Only
    // pending and processing jobs are returned to legacy admission; held and
    // rejected safety decisions remain hidden for human review.
    if (change.enabled === false) {
      await client.query(`UPDATE hat_media SET screening_status = 'legacy',
        screening_locked_at = NULL, screening_lock_token = NULL,
        screening_reason = 'screening_disabled', screening_retry_at = NOW()
        WHERE screening_status IN ('pending','processing')`)
    }
    await client.query(`INSERT INTO admin_audit_logs
      (admin_id,action,target_type,metadata) VALUES
      ($1,'update_showroom_screening_config','showroom_config',$2::jsonb)`,
    [adminId, JSON.stringify({ changed: Object.keys(change), enabled: next.enabled, secretsRedacted: true })])
    await client.query('COMMIT')
  } catch (err) { await client.query('ROLLBACK').catch(() => {}); throw err }
  finally { client.release() }
  return adminScreeningStatus()
}
export function newGeneratedWorkerSecret() { return randomBytes(32).toString('base64url') }
