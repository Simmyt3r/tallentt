const DEFAULT_JSON_BODY_LIMIT = 256 * 1024

function setSecurityHeaders(res) {
  if (!res?.setHeader) return
  res.setHeader('X-Content-Type-Options', 'nosniff')
  res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin')
  res.setHeader('X-Frame-Options', 'DENY')
  res.setHeader('Permissions-Policy', 'camera=(), microphone=(), geolocation=()')
}

export function json(res, status, body) {
  setSecurityHeaders(res)
  res.statusCode = status
  res.setHeader('Content-Type', 'application/json; charset=utf-8')
  res.end(JSON.stringify(body))
}

export function methodNotAllowed(res, allowed = []) {
  res.setHeader('Allow', allowed.join(', '))
  json(res, 405, { error: 'Method not allowed' })
}

export async function readRawBody(req, { maxBytes = DEFAULT_JSON_BODY_LIMIT } = {}) {
  return new Promise((resolve, reject) => {
    const chunks = []
    let total = 0
    let settled = false

    req.on('data', (chunk) => {
      if (settled) return
      total += chunk.length
      if (total > maxBytes) {
        settled = true
        const err = Object.assign(new Error('Request body too large.'), { status: 413 })
        reject(err)
        req.destroy?.()
        return
      }
      chunks.push(chunk)
    })

    req.on('end', () => {
      if (settled) return
      settled = true
      resolve(Buffer.concat(chunks))
    })

    req.on('error', (err) => {
      if (settled) return
      settled = true
      reject(err)
    })
  })
}

export async function readBody(req, options) {
  const raw = await readRawBody(req, options)
  try {
    const text = raw.toString('utf8')
    return text ? JSON.parse(text) : {}
  } catch {
    throw Object.assign(new Error('Invalid JSON request body.'), { status: 400 })
  }
}

export function isVerifiedName(name) {
  if (!name) return false
  return /\b(Ltd|Plc|Corp|Inc|LLC)\b\.?$/i.test(name.trim())
}
