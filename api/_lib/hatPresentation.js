import { query } from './db.js'

export const HAT_ACCENTS = Object.freeze({
  electric: '#0A13E6',
  coral: '#DC4F36',
  forest: '#21764C',
  violet: '#744AC9',
  rose: '#C64275',
  slate: '#415167',
  ocean: '#007F95',
  amber: '#965E09',
})
export const SHOWROOM_TEMPLATES = Object.freeze(['minimal', 'bold', 'media-first', 'editorial', 'dark'])

let ready = null
export async function ensureHatPresentationStorage() {
  if (ready) return ready
  ready = query(`CREATE TABLE IF NOT EXISTS hat_presentation (
    hat_id UUID PRIMARY KEY REFERENCES hats(id) ON DELETE CASCADE,
    accent TEXT NOT NULL DEFAULT 'electric'
      CHECK (accent IN ('electric','coral','forest','violet','rose','slate','ocean','amber')),
    template TEXT NOT NULL DEFAULT 'minimal'
      CHECK (template IN ('minimal','bold','media-first','editorial','dark')),
    bento_mode TEXT NOT NULL DEFAULT 'standard' CHECK (bento_mode IN ('standard', 'flyer')),
    flyer_public_id TEXT,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
  )`).catch(error => {
    ready = null
    throw error
  })
  return ready
}

export function validateHatPresentation({ accent, template, bentoMode = 'standard', flyerPublicId = null } = {}) {
  if (!Object.hasOwn(HAT_ACCENTS, accent)) return 'Select one of the approved card accents.'
  if (!SHOWROOM_TEMPLATES.includes(template)) return 'Select an approved Showroom layout.'
  if (!['standard', 'flyer'].includes(bentoMode)) return 'Choose standard or flier layout.'
  if (bentoMode === 'flyer' && (typeof flyerPublicId !== 'string' || !flyerPublicId || flyerPublicId.length > 255)) return 'Choose an approved Hat image for the flier.'
  return null
}

export async function getHatPresentationMap(hatIds) {
  const ids = Array.isArray(hatIds) ? hatIds.filter(Boolean) : []
  if (!ids.length) return {}
  try {
    const { rows } = await query(
      'SELECT hat_id, accent, template, bento_mode, flyer_public_id FROM hat_presentation WHERE hat_id = ANY($1::uuid[])',
      [ids],
    )
    return Object.fromEntries(rows.map(row => [row.hat_id, row]))
  } catch (error) {
    // A live deployment with no configured styles has no presentation table yet.
    if (error.code === '42P01') return {}
    throw error
  }
}

export async function saveHatPresentation(userId, hatId, data) {
  const validation = validateHatPresentation(data)
  if (validation) throw Object.assign(new Error(validation), { status: 400 })
  await ensureHatPresentationStorage()
  // Only existing, approved images uploaded to this Hat are eligible flier art.
  const { rows } = await query(
    `INSERT INTO hat_presentation (hat_id, accent, template, bento_mode, flyer_public_id)
     SELECT h.id, $3, $4, $5, CASE WHEN $5 = 'flyer' THEN $6 ELSE NULL END
       FROM hats h WHERE h.id = $1 AND h.user_id = $2
         AND ($5 <> 'flyer' OR EXISTS (
           SELECT 1 FROM hat_media m WHERE m.hat_id = h.id AND m.public_id = $6
             AND m.type = 'image' AND m.screening_status IN ('legacy', 'passed')
         ))
     ON CONFLICT (hat_id) DO UPDATE SET
       accent = EXCLUDED.accent, template = EXCLUDED.template,
       bento_mode = EXCLUDED.bento_mode, flyer_public_id = EXCLUDED.flyer_public_id,
       updated_at = NOW()
     RETURNING hat_id, accent, template, bento_mode, flyer_public_id`,
    [hatId, userId, data.accent, data.template, data.bentoMode || 'standard', data.flyerPublicId || null],
  )
  if (!rows.length) throw Object.assign(new Error('Hat not found or flier image is not approved for this Hat.'), { status: 400 })
  return rows[0]
}
