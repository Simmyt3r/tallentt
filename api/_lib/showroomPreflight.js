// Read-only deployment gate for Admin. No secrets, provider responses or user
// data are returned. This check is advisory and cannot activate rollouts.
import { query } from './db.js'
import { uploadCloudCredentials, signedHatMediaEnabled } from './hatMediaUpload.js'

const tables = [
  ['showroom_review_state', 'Showroom review restrictions'],
  ['showroom_appeals', 'Showroom appeals'],
  ['showroom_screening_config', 'Admin screening settings'],
  ['showroom_screening_runs', 'Screening run history'],
  ['hat_media_upload_permits', 'Signed upload permits'],
]
const columns = [
  ['hat_media','screening_status'],
  ['hat_media','screening_retry_at'],
  ['hat_media','screening_lock_token'],
  ['hats','feed_visible'],
]

export async function getShowroomDeploymentPreflight() {
  const [{rows: tableRows},{rows: columnRows}] = await Promise.all([
    query(`SELECT table_name, to_regclass(table_name) IS NOT NULL AS installed
      FROM unnest($1::text[]) AS t(table_name)`, [tables.map(x=>x[0])]),
    query(`SELECT table_name,column_name FROM information_schema.columns
      WHERE table_schema=current_schema() AND
      (table_name,column_name) IN (
        ('hat_media','screening_status'),('hat_media','screening_retry_at'),
        ('hat_media','screening_lock_token'),('hats','feed_visible')
      )`),
  ])
  const foundTables=new Set(tableRows.filter(x=>x.installed).map(x=>x.table_name))
  const foundColumns=new Set(columnRows.map(x=>x.table_name+'.'+x.column_name))
  let credentialReady=false
  let cloudName=null
  try {
    const credentials=uploadCloudCredentials()
    cloudName=credentials.cloudName
    credentialReady=true
  } catch {}
  const signed=signedHatMediaEnabled()
  const requiredMigrations=[
    ...tables.map(([name,label])=>({key:name,label,ready:foundTables.has(name)})),
    ...columns.map(([table,column])=>({
      key:table+'.'+column, label:table+'.'+column,
      ready:foundColumns.has(table+'.'+column),
    })),
  ]
  return {
    migrations:requiredMigrations,
    missingMigrations:requiredMigrations.filter(x=>!x.ready).map(x=>x.key),
    signedUploads:{enabled:signed, credentialsConfigured:credentialReady,
      databaseReady:foundTables.has('hat_media_upload_permits'),
      cloudName:cloudName||null},
    encryptionRootConfigured:Boolean(process.env.SHOWROOM_CONFIG_ENCRYPTION_KEY||process.env.JWT_SECRET),
    readyToDeploy:requiredMigrations.every(x=>x.ready) &&
      Boolean(process.env.SHOWROOM_CONFIG_ENCRYPTION_KEY||process.env.JWT_SECRET),
    // Never claim scheduled GitHub Actions configuration is verified here.
    workerAutomation:'Requires GitHub Actions secrets and repo variable; check manually',
  }
}
export async function testCloudinaryAdminConnection({fetchImpl=fetch}={}) {
  const {cloudName,apiKey,apiSecret}=uploadCloudCredentials()
  let result
  try {
    result=await fetchImpl(
      `https://api.cloudinary.com/v1_1/${cloudName}/resources/image?max_results=1`,{
        headers:{Authorization:'Basic '+Buffer.from(apiKey+':'+apiSecret).toString('base64')},
        signal:AbortSignal.timeout(10000),
      })
  } catch {
    throw Object.assign(new Error('Could not reach Cloudinary Admin API.'),{status:503})
  }
  if (!result.ok) throw Object.assign(
    new Error('Cloudinary Admin API rejected the request. Verify the cloud, key, secret and API permissions.'),
    {status:503})
  return {ok:true,service:'Cloudinary Admin API',validatedAt:new Date().toISOString()}
}
