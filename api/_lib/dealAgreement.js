import {createHmac,timingSafeEqual} from 'node:crypto'
import {query} from './db.js'
import {bookingError,requireBookingId} from './bookingRules.js'

// Evidence token references the database's current agreement data; verifying a
// printout always checks the live status. It is NOT an admission guarantee.
// Server-only HMAC, unlike a predictable SHA-256 of public fields.
const tokenPattern=/^CTAG1\.([a-f0-9-]{36})\.([a-f0-9]{64})$/i
function key(){
  const secret=process.env.JWT_SECRET
  if(!secret||Buffer.byteLength(secret,'utf8')<32)
    throw bookingError(503,'Agreement verification signing is not configured.')
  return secret
}
function digest(row){
  const parts=[row.id,row.client_id,row.talent_id,row.hat_id,row.amount,row.currency,
    row.pay_unit||'',row.agreed_at?new Date(row.agreed_at).toISOString():'',
    row.funded_at?new Date(row.funded_at).toISOString():'']
  return createHmac('sha256',key()).update(parts.join('|')).digest('hex')
}
async function readRecord(dealId,dbQuery=query){
  requireBookingId(dealId)
  const {rows}=await dbQuery(`SELECT e.id,e.hat_id,e.client_id,e.talent_id,e.status,
    e.amount,e.currency,e.pay_unit,e.agreed_at,e.created_at,e.funded_at,
    e.work_status,e.work_started_at,e.start_released_amount,
    h.hat_title,h.hat_name,h.category,h.hiring_duration,h.lga AS hat_lga,
    client_user.username AS client_username,client_user.full_name AS client_name,
    client_user.role AS client_role,
    talent_user.username AS talent_username,talent_user.full_name AS talent_name,
    talent_user.role AS talent_role
    FROM escrows e JOIN hats h ON h.id=e.hat_id
    JOIN users client_user ON client_user.id=e.client_id
    JOIN users talent_user ON talent_user.id=e.talent_id
    WHERE e.id=$1 LIMIT 1`,[dealId])
  if(!rows[0])throw bookingError(404,'Agreement not found.')
  return rows[0]
}
export async function getDealAgreement(userId,dealId,dbQuery=query){
  const row=await readRecord(dealId,dbQuery)
  if(userId!==row.client_id&&userId!==row.talent_id)
    throw bookingError(404,'Agreement not found.')
  const issued=row.status==='secured'||row.status==='released'||row.status==='refunded'
  const signed=issued? `CTAG1.${row.id}.${digest(row)}`:null
  const {client_id,talent_id,...publicRow}=row
  return {
    agreement:publicRow,
    verificationToken:signed,
    documentType:issued?'funded_agreement':'draft',
    gatePassEligible:row.status==='secured',
    verificationRequired:true,
  }
}
export async function verifyAgreementToken(token,dbQuery=query){
  const match=String(token||'').match(tokenPattern)
  if(!match)throw bookingError(400,'Invalid agreement verification code.')
  const row=await readRecord(match[1],dbQuery)
  const expected=Buffer.from(digest(row),'hex'),given=Buffer.from(match[2],'hex')
  if(expected.length!==given.length||!timingSafeEqual(expected,given))
    throw bookingError(400,'Invalid or outdated agreement verification code.')
  // No email, phone, address or payment reference is exposed to a verifier.
  return {verified:true,dealId:row.id,hatTitle:row.hat_title,
    clientName:row.client_name,talentName:row.talent_name,
    amount:row.amount,currency:row.currency,payUnit:row.pay_unit,serviceArea:row.hat_lga,
    status:row.status,gatePassEligible:row.status==='secured',
    message:row.status==='secured'
      ? 'Funded deal verified. Physical access still requires venue approval and identity matching.'
      : 'This agreement has a valid signature but is not an active gate pass.'}
}
