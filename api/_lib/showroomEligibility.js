import {createCipheriv,createDecipheriv,createHmac,randomBytes} from 'node:crypto'
// First-pass deterministic text eligibility checks for Showroom.
// This is deliberately NOT OCR or image/video moderation.
export const SHOWROOM_SQL_CONTACT_PATTERN =
  '(whats?app|telegram|wa[.]me|t[.]me|https?://|www[.]|[[:alnum:]._%+-]+@[[:alnum:].-]+[.][[:alpha:]]{2,}|(^|[^[:digit:]])[+]?[[:digit:]][[:digit:] .()-]{8,}[[:digit:]]([^[:digit:]]|$))'

const linkOrEmail = /(whats?app|telegram|wa\.me|t\.me|https?:\/\/|www\.|[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,})/i
const possiblePhone = /\+?\d[\d\s().-]{8,}\d/g

export function containsContactBypass(value) {
  if (typeof value !== 'string' || !value.trim()) return false
  if (linkOrEmail.test(value)) return true
  const numbers = value.match(possiblePhone) || []
  return numbers.some((match) => {
    const digits = match.replace(/\D/g, '')
    return digits.length >= 10 && digits.length <= 15
  })
}

export function showroomTextIssue({ title, motto, media } = {}) {
  const parts = [title, motto]
  if (Array.isArray(media)) parts.push(...media.map((item) => item?.caption))
  return parts.some(containsContactBypass)
    ? 'Remove contact numbers, email addresses, website links and messaging handles from Showroom text. Use Deals Chat after a deal is accepted.'
    : null
}

// The ranking score includes private view data. Never expose it in a
// merely base64-encoded cursor. Domain-separated authenticated encryption
// keeps pagination stable across serverless instances with the same secret.
const cursorKey=secret=>{
  if(!secret)throw Object.assign(new Error('Showroom pagination is not configured.'),{status:503})
  return createHmac('sha256',secret).update('chombutar-showroom-cursor-v2').digest()
}
export function encodeShowroomCursor({ score, created_at, id },secret=process.env.SHOWROOM_CURSOR_SECRET||process.env.JWT_SECRET) {
  const iv=randomBytes(12)
  const cipher=createCipheriv('aes-256-gcm',cursorKey(secret),iv)
  const body=Buffer.concat([cipher.update(JSON.stringify([Number(score),new Date(created_at).toISOString(),id]),'utf8'),cipher.final()])
  return 'v2.'+Buffer.concat([iv,cipher.getAuthTag(),body]).toString('base64url')
}
export function decodeShowroomCursor(cursor,secret=process.env.SHOWROOM_CURSOR_SECRET||process.env.JWT_SECRET) {
  if(!cursor)return null
  try{
    if(typeof cursor!=='string'||cursor.length>300||!/^v2[.][A-Za-z0-9_-]+$/.test(cursor))throw new Error()
    const bytes=Buffer.from(cursor.slice(3),'base64url')
    if(bytes.length<29||bytes.toString('base64url')!==cursor.slice(3))throw new Error()
    const decipher=createDecipheriv('aes-256-gcm',cursorKey(secret),bytes.subarray(0,12))
    decipher.setAuthTag(bytes.subarray(12,28))
    const [score,date,id]=JSON.parse(Buffer.concat([decipher.update(bytes.subarray(28)),decipher.final()]).toString('utf8'))
    if(!Number.isInteger(score)||!Number.isFinite(Date.parse(date))||
      !/^[a-f0-9]{8}(-[a-f0-9]{4}){3}-[a-f0-9]{12}$/i.test(id))throw new Error()
    return {score,date,id}
  }catch(error){
    if(error.status===503)throw error
    throw Object.assign(new Error('Invalid Showroom pagination cursor. Refresh the feed.'),{status:400})
  }
}
