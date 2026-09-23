import { query, getClient } from '../_lib/db.js'
import { getSessionUser } from '../_lib/auth.js'
import { json, methodNotAllowed, readBody, isVerifiedName } from '../_lib/http.js'
import { computeOrbitScore } from '../_lib/orbitScore.js'
import { HAT_TYPES, DELIVERY_MODES, HAT_TITLE_MAX, HAT_DESCRIPTION_MAX, HAT_NAME_MAX, normalizePricing, normalizeAvailableDays, normalizeHiringDuration } from '../_lib/hatFields.js'
import { notifyApplicationReceived, notifyApplicationStatus } from '../_lib/notifications.js'

async function getHat(id, viewerId) {
  const { rows } = await query(
    `SELECT h.*,
            u.avatar_url as owner_avatar,
            u.full_name as owner_full_name,
            u.username as owner_username,
            u.role as owner_role,
            u.company_suffix as owner_company_suffix,
            u.bio as owner_bio,
            u.location as owner_location,
            u.lga as owner_lga,
            u.country as owner_country,
            -- Same "N jobs"/"N hires" completed-engagement count as the feed
            -- listing (api/hats/index.js) — kept identical so a card looks
            -- the same whether it came from the feed or a direct /hat/:id
            -- load. See that file's comment for why this reuses escrows
            -- rather than a new table.
            (SELECT COUNT(*)::int FROM escrows e
               WHERE e.status = 'released'
                 AND ((h.role = 'talent' AND e.talent_id = h.user_id)
                   OR (h.role = 'client' AND e.client_id = h.user_id))
            ) AS hires
     FROM hats h LEFT JOIN users u ON u.id = h.user_id WHERE h.id = $1`,
    [id],
  )
  if (!rows[0]) return null
  const { rows: media } = await query(
    `SELECT id, hat_id, url, public_id, type, caption FROM hat_media WHERE hat_id = $1 ORDER BY created_at, id`,
    [id],
  )
  let likedByMe = false
  if (viewerId) {
    try {
      const { rows: likeRows } = await query(
        `SELECT 1 FROM hat_likes WHERE hat_id = $1 AND user_id = $2`,
        [id, viewerId],
      )
      likedByMe = likeRows.length > 0
    } catch (likeErr) {
      // hat_likes may not exist yet if db/patch-views-likes.sql hasn't
      // been run — don't let that break fetching the hat itself.
      console.error('liked_by_me lookup failed (has patch-views-likes.sql been run?):', likeErr)
    }
  }
  // The viewer's own application against this hat, if any — { id, status }
  // or null. Powers has_applied below and lets TalentProfile/the detail
  // modal show "Applied" instead of a raw Apply button.
  let myApplication = null
  if (viewerId) {
    try {
      const { rows: appRows } = await query(
        `SELECT id, status FROM applications WHERE hat_id = $1 AND applicant_id = $2`,
        [id, viewerId],
      )
      myApplication = appRows[0] || null
    } catch (appErr) {
      // applications may not exist yet if db/patch-applications.sql hasn't
      // been run — don't let that break fetching the hat itself.
      console.error('my_application lookup failed (has patch-applications.sql been run?):', appErr)
    }
  }
  return {
    ...rows[0],
    media,
    confidence: rows[0].orbit_score,
    liked_by_me: likedByMe,
    my_application: myApplication,
  }
}

// Builds the normalized card-detail shape BentoCardDetailModal needs. This
// is purely a mapped/derived view over the same hats + users data getHat()
// already fetches (plus a check against the existing escrows table) — no
// new tables or columns. Only returned for ?include=owner so the legacy
// `{ hat }` shape below stays untouched for existing consumers (HatForm,
// TalentProfile, Showroom, etc).
async function buildCardDetail(hat, viewerId) {
  const location = [hat.lga, hat.country].filter(Boolean).join(', ') || null
  const ownerLocation =
    hat.owner_location || [hat.owner_lga, hat.owner_country].filter(Boolean).join(', ') || null
  const rawBio = hat.owner_bio || ''
  const bioShort = rawBio ? (rawBio.length > 140 ? rawBio.slice(0, 140) + '…' : rawBio) : null

  // "Booked" reuses the existing escrows system — a client with a
  // secured/released escrow against this hat has effectively booked it.
  // There's no separate bookings table to invent here.
  let hasBooked = false
  if (viewerId) {
    try {
      const { rows } = await query(
        `SELECT 1 FROM escrows WHERE hat_id = $1 AND client_id = $2 AND status IN ('secured','released') LIMIT 1`,
        [hat.id, viewerId],
      )
      hasBooked = rows.length > 0
    } catch (err) {
      console.error('has_booked lookup failed:', err)
    }
  }

  // A pending or accepted row in `applications` (see getHat's my_application)
  // means the viewer has an active application on this hat.
  const hasApplied = Boolean(hat.my_application && ['pending', 'accepted'].includes(hat.my_application.status))

  return {
    id: hat.id,
    title: hat.hat_title,
    // hats has no dedicated long-form description column — motto is the
    // closest existing free-text field tied to the card, so it's reused
    // here rather than adding a new one.
    description: hat.motto || null,
    media: (hat.media || []).map((m) => ({ url: m.url, type: m.type, caption: m.caption || null })),
    tags: hat.skills || [],
    category: hat.category || null,
    hiring_duration: hat.hiring_duration || null,
    budget: {
      type: hat.price_type,
      currency: hat.currency || 'NGN',
      amount: hat.price_type === 'fixed' ? hat.rate ?? null : null,
      min: hat.price_type === 'range' ? hat.price_min ?? null : null,
      max: hat.price_type === 'range' ? hat.price_max ?? null : null,
      unit: hat.rate_unit === 'custom' ? hat.rate_unit_custom : hat.rate_unit || null,
      negotiable: Boolean(hat.price_negotiable),
    },
    location,
    created_at: hat.created_at,
    owner: {
      id: hat.user_id,
      name: hat.owner_full_name || hat.username,
      avatar_url: hat.owner_avatar || null,
      // The hat's own role (talent/client) — not the account-level role,
      // which can be 'dual' — since this is what the frontend already
      // uses to decide Book vs Apply (see BentoCard's `isTalent`).
      role: hat.role,
      handle: hat.owner_username || hat.username,
      is_verified: Boolean(hat.is_verified),
      // No reviews system exists — hat.rating is the only rating data on
      // file, and review_count safely defaults to 0 rather than inventing one.
      rating: Number(hat.rating || 0),
      review_count: 0,
      location: ownerLocation,
      bio_short: bioShort,
    },
    has_applied: hasApplied,
    has_booked: hasBooked,
  }
}

export default async function handler(req, res) {
  const id = req.query?.id || (req.url.match(/\/api\/hats\/([^/?]+)/) || [])[1]
  if (!id) return json(res, 400, { error: 'Missing id' })

  if (req.method === 'GET') {
    try {
      const session = getSessionUser(req)
      const hat = await getHat(id, session?.sub)
      if (!hat) return json(res, 404, { error: 'Hat not found' })

      // GET /api/hats/:id?include=owner — normalized shape for
      // BentoCardDetailModal. Extends this same endpoint rather than
      // adding a parallel one; plain GET keeps returning the legacy
      // `{ hat }` shape existing consumers already depend on.
      const url = new URL(req.url, `http://${req.headers.host}`)
      const include = (url.searchParams.get('include') || '')
        .split(',')
        .map((s) => s.trim())
        .filter(Boolean)

      if (include.includes('owner')) {
        const card = await buildCardDetail(hat, session?.sub)
        return json(res, 200, card)
      }

      // GET /api/hats/:id?include=applications — owner-only list of who
      // applied to this hat, for MyHats. Reuses this same endpoint/function
      // rather than a dedicated one (see the [action] merge in
      // api/escrows for why — Vercel Hobby's 12-function cap).
      if (include.includes('applications')) {
        if (!session?.sub || hat.user_id !== session.sub) {
          return json(res, 403, { error: 'Forbidden' })
        }
        try {
          const { rows: applications } = await query(
            `SELECT a.id, a.status, a.message, a.created_at,
                    u.id as applicant_id, u.username, u.full_name, u.avatar_url,
                    u.role, u.company_suffix
             FROM applications a
             JOIN users u ON u.id = a.applicant_id
             WHERE a.hat_id = $1
             ORDER BY a.created_at DESC`,
            [id],
          )
          return json(res, 200, { hat, applications })
        } catch (appErr) {
          console.error('applications list failed (has patch-applications.sql been run?):', appErr)
          return json(res, 200, { hat, applications: [] })
        }
      }

      return json(res, 200, { hat })
    } catch (err) {
      console.error(err)
      return json(res, 500, { error: 'Failed to fetch hat' })
    }
  }

  if (req.method === 'PUT') {
    try {
      const session = getSessionUser(req)
      if (!session?.sub) return json(res, 401, { error: 'Unauthorized' })

      const existing = await getHat(id)
      if (!existing) return json(res, 404, { error: 'Hat not found' })
      if (existing.user_id !== session.sub) return json(res, 403, { error: 'Forbidden' })

      const body = await readBody(req)

      // Adding media to a talent hat is how content reaches the Showroom, and
      // that is Talent-only: a pure Client account may not do it (talent and
      // dual accounts may). Only *new* media is checked, so a Client account
      // can still edit whatever it already owns.
      if (Array.isArray(body.media) && (body.role ?? existing.role) === 'talent') {
        const known = new Set((existing.media || []).map((m) => m.public_id))
        const addingMedia = body.media.some((m) => m?.public_id && !known.has(m.public_id))
        if (addingMedia) {
          const { rows: account } = await query(`SELECT role FROM users WHERE id = $1`, [session.sub])
          if (account[0]?.role === 'client') {
            return json(res, 403, { error: 'Only Talent accounts can add to the Showroom.' })
          }
        }
      }

      // Never accept username from client on update — keep account username
      const verified =
        body.verified_name != null ? isVerifiedName(body.verified_name) : existing.is_verified

      // A hat's role is fixed when it's created (applications hang off client
      // hats, escrows off talent hats) — re-sending the same role is fine,
      // changing it is not.
      if (body.role != null && body.role !== existing.role) {
        return json(res, 403, { error: "A Hat's role can't be changed after it's created." })
      }
      if (body.hat_title != null) {
        const nextTitle = String(body.hat_title).trim()
        if (!nextTitle) return json(res, 400, { error: 'A seeking title is required.' })
        if (nextTitle.length > HAT_TITLE_MAX) {
          return json(res, 400, { error: `Title must be ${HAT_TITLE_MAX} characters or fewer.` })
        }
        body.hat_title = nextTitle
      }
      if (body.hat_name != null) {
        const nextName = String(body.hat_name).trim()
        if (!nextName) return json(res, 400, { error: 'A name for this listing is required.' })
        if (nextName.length > HAT_NAME_MAX) {
          return json(res, 400, { error: `Name must be ${HAT_NAME_MAX} characters or fewer.` })
        }
        body.hat_name = nextName
      }
      if (body.motto != null && String(body.motto).length > HAT_DESCRIPTION_MAX) {
        return json(res, 400, { error: `Description must be ${HAT_DESCRIPTION_MAX} characters or fewer.` })
      }
      if (body.hat_type != null && !HAT_TYPES.includes(body.hat_type)) {
        return json(res, 400, { error: 'Invalid hat type.' })
      }
      if (body.delivery_mode != null && !DELIVERY_MODES.includes(body.delivery_mode)) {
        return json(res, 400, { error: 'Invalid delivery mode.' })
      }
      const duration = normalizeHiringDuration(body.hiring_duration, existing.role, existing.hiring_duration)
      if (!duration.ok) return json(res, 400, { error: duration.error })

      // Pricing is only re-validated/re-normalized when the client actually
      // sent pricing fields this time — otherwise keep what's on file.
      const touchedPricing = ['price_type', 'rate', 'price_min', 'price_max'].some((k) => body[k] != null)
      let pricingFields = {
        price_type: existing.price_type,
        rate: existing.rate,
        rate_unit: existing.rate_unit,
        rate_unit_custom: existing.rate_unit_custom,
        price_min: existing.price_min,
        price_max: existing.price_max,
        price_negotiable: existing.price_negotiable,
      }
      if (touchedPricing) {
        const merged = { ...existing, ...body }
        // Switching price type without saying anything about negotiability
        // starts from "not negotiable" rather than inheriting the old type's flag.
        if (body.price_negotiable === undefined && body.price_type && body.price_type !== existing.price_type) {
          merged.price_negotiable = false
        }
        const pricing = normalizePricing(merged)
        if (!pricing.ok) return json(res, 400, { error: pricing.error })
        pricingFields = pricing.fields
      }

      const nextSkills = body.skills ?? existing.skills ?? []
      const nextMotto = body.motto ?? existing.motto
      const nextAvail = body.availability != null ? body.availability : existing.availability
      const days = normalizeAvailableDays(body.available_days, existing.available_days)
      if (!days.ok) return json(res, 400, { error: days.error })

      // `media` is only replaced when the client actually sends it — a text-only
      // edit leaves existing media untouched. When it is sent, the array order
      // is the display order (index 0 = cover).
      const nextMedia = Array.isArray(body.media) ? body.media.filter((m) => m && m.url && m.public_id) : null
      const mediaCount = nextMedia ? nextMedia.length : existing.media?.length || 0

      // The daily availability window can be cleared: `undefined` (key absent)
      // keeps what's on file, `null`/'' clears it.
      const windowValue = (incoming, current) => (incoming === undefined ? current ?? null : incoming || null)

      const orbitScore = computeOrbitScore({
        mediaCount,
        isVerified: verified,
        skillsCount: Array.isArray(nextSkills) ? nextSkills.length : 0,
        hasMotto: Boolean(nextMotto && String(nextMotto).trim()),
        hasPrice: pricingFields.price_type === 'fixed' ? pricingFields.rate > 0 : pricingFields.price_min > 0,
        availability: nextAvail,
        bookings: existing.bookings || 0,
        likes: existing.likes || 0,
        rating: existing.rating || 0,
      })

      // Media replacement and the hat update commit together, so a failure
      // can never leave a hat with its media half-deleted. (Only client.query
      // inside the transaction — the pool is size 1 in production.)
      const client = await getClient()
      try {
        await client.query('BEGIN')
        if (nextMedia) {
          await client.query(`DELETE FROM hat_media WHERE hat_id = $1`, [id])
          for (let i = 0; i < nextMedia.length; i++) {
            const m = nextMedia[i]
            // created_at is staggered by index: NOW() is constant inside a
            // transaction, and reads order by created_at.
            await client.query(
              `INSERT INTO hat_media (hat_id, url, public_id, type, caption, created_at)
               VALUES ($1,$2,$3,$4,$5, NOW() + $6::int * interval '1 millisecond')`,
              [id, m.url, m.public_id, m.type || 'image', m.caption || null, i],
            )
          }
        }
        await client.query(
          `UPDATE hats SET
            hat_title = COALESCE($1, hat_title),
            hat_name = COALESCE($2, hat_name),
            verified_name = COALESCE($3, verified_name),
            is_verified = $4,
            category = COALESCE($5, category),
            skills = COALESCE($6, skills),
            hat_type = COALESCE($7, hat_type),
            hiring_duration = $8,
            delivery_mode = COALESCE($9, delivery_mode),
            country = COALESCE($10, country),
            country_flag = COALESCE($11, country_flag),
            currency = COALESCE($12, currency),
            lga = COALESCE($13, lga),
            motto = COALESCE($14, motto),
            price_type = $15,
            price_min = $16,
            price_max = $17,
            price_negotiable = $18,
            rate = $19,
            rate_unit = $20,
            rate_unit_custom = $21,
            availability = COALESCE($22, availability),
            active = COALESCE($23, active),
            available_days = $24,
            available_from = $25,
            available_to = $26,
            orbit_score = $27
          WHERE id = $28`,
          [
            body.hat_title ?? null,
            body.hat_name ?? null,
            body.verified_name ?? null,
            verified,
            body.category ?? null,
            body.skills ?? null,
            body.hat_type ?? null,
            duration.value,
            body.delivery_mode ?? null,
            body.country ?? null,
            body.country_flag ?? null,
            body.currency ?? null,
            body.lga ?? null,
            body.motto ?? null,
            pricingFields.price_type,
            pricingFields.price_min,
            pricingFields.price_max,
            pricingFields.price_negotiable,
            pricingFields.rate,
            pricingFields.rate_unit,
            pricingFields.rate_unit_custom,
            body.availability ?? null,
            body.active ?? null,
            days.days,
            windowValue(body.available_from, existing.available_from),
            windowValue(body.available_to, existing.available_to),
            orbitScore,
            id,
          ],
        )
        await client.query('COMMIT')
      } catch (txErr) {
        await client.query('ROLLBACK').catch(() => {})
        throw txErr
      } finally {
        client.release()
      }

      const hat = await getHat(id)
      return json(res, 200, { hat })
    } catch (err) {
      console.error(err)
      return json(res, 500, { error: err.message || 'Failed to update hat' })
    }
  }

  // Lightweight engagement actions — unlike PUT, these aren't owner-only:
  // any logged-in user can view or like someone else's hat.
  if (req.method === 'PATCH') {
    try {
      const session = getSessionUser(req)
      if (!session?.sub) return json(res, 401, { error: 'Unauthorized' })

      const existing = await getHat(id)
      if (!existing) return json(res, 404, { error: 'Hat not found' })

      const body = await readBody(req)
      let application = null
      let alreadyApplied = false

      if (body.action === 'view') {
        await query(`UPDATE hats SET views = views + 1 WHERE id = $1`, [id])
      } else if (body.action === 'like') {
        const { rows: likeRows } = await query(
          `SELECT 1 FROM hat_likes WHERE hat_id = $1 AND user_id = $2`,
          [id, session.sub],
        )
        if (likeRows.length) {
          await query(`DELETE FROM hat_likes WHERE hat_id = $1 AND user_id = $2`, [id, session.sub])
          await query(`UPDATE hats SET likes = GREATEST(likes - 1, 0) WHERE id = $1`, [id])
        } else {
          await query(
            `INSERT INTO hat_likes (hat_id, user_id) VALUES ($1,$2) ON CONFLICT DO NOTHING`,
            [id, session.sub],
          )
          await query(`UPDATE hats SET likes = likes + 1 WHERE id = $1`, [id])
        }
      } else if (body.action === 'apply') {
        // Applying to your own hat makes no sense.
        if (existing.user_id === session.sub) {
          return json(res, 400, { error: "You can't apply to your own hat." })
        }
        if (existing.role !== 'client') {
          return json(res, 400, { error: 'Talent hats are booked, not applied to.' })
        }
        const message = typeof body.message === 'string' ? body.message.slice(0, 500) : null
        const { rows: existingApp } = await query(
          `SELECT id, status FROM applications WHERE hat_id = $1 AND applicant_id = $2`,
          [id, session.sub],
        )
        if (existingApp[0] && ['pending', 'accepted'].includes(existingApp[0].status)) {
          // Already have a live application — idempotent, not an error.
          application = existingApp[0]
          alreadyApplied = true
        } else if (existingApp[0]) {
          // Re-applying after a withdrawal/rejection — reuse the row (the
          // hat_id+applicant_id unique constraint means we can't insert
          // a second one) instead of erroring.
          const { rows } = await query(
            `UPDATE applications SET status = 'pending', message = COALESCE($1, message), created_at = NOW(), updated_at = NOW()
             WHERE id = $2 RETURNING *`,
            [message, existingApp[0].id],
          )
          application = rows[0]
        } else {
          const { rows } = await query(
            `INSERT INTO applications (hat_id, applicant_id, message) VALUES ($1,$2,$3) RETURNING *`,
            [id, session.sub, message],
          )
          application = rows[0]
        }
        if (application && !alreadyApplied) {
          try {
            const { rows: applicantRows } = await query(`SELECT username, full_name FROM users WHERE id = $1`, [session.sub])
            await notifyApplicationReceived({
              ownerId: existing.user_id,
              hatId: existing.id,
              hatTitle: existing.hat_title,
              applicationId: application.id,
              applicantUsername: applicantRows[0]?.username,
              applicantName: applicantRows[0]?.full_name,
            })
          } catch (notifyErr) {
            console.error('application received notification failed:', notifyErr)
          }
        }
      } else if (body.action === 'withdraw') {
        const { rows } = await query(
          `UPDATE applications SET status = 'withdrawn', updated_at = NOW()
           WHERE hat_id = $1 AND applicant_id = $2 AND status IN ('pending','accepted')
           RETURNING *`,
          [id, session.sub],
        )
        application = rows[0] || null
      } else if (body.action === 'respond_application') {
        // Hat owner accepting/rejecting one of their applicants.
        if (existing.user_id !== session.sub) return json(res, 403, { error: 'Forbidden' })
        const { application_id, status } = body
        if (!application_id || !['accepted', 'rejected'].includes(status)) {
          return json(res, 400, { error: 'application_id and a valid status (accepted/rejected) are required.' })
        }
        const { rows } = await query(
          `UPDATE applications SET status = $1, updated_at = NOW() WHERE id = $2 AND hat_id = $3 RETURNING *`,
          [status, application_id, id],
        )
        if (!rows[0]) return json(res, 404, { error: 'Application not found' })
        application = rows[0]
        await notifyApplicationStatus({ applicationId: application.id, status })
      } else {
        return json(res, 400, { error: 'Unknown action' })
      }

      const hat = await getHat(id, session.sub)
      return json(res, 200, { hat, application, already_applied: alreadyApplied })
    } catch (err) {
      console.error(err)
      return json(res, 500, { error: 'Failed to update engagement' })
    }
  }

  if (req.method === 'DELETE') {
    try {
      const session = getSessionUser(req)
      if (!session?.sub) return json(res, 401, { error: 'Unauthorized' })
      const existing = await getHat(id)
      if (!existing) return json(res, 404, { error: 'Hat not found' })
      if (existing.user_id !== session.sub) return json(res, 403, { error: 'Forbidden' })
      await query(`DELETE FROM hats WHERE id = $1`, [id])
      return json(res, 200, { ok: true })
    } catch (err) {
      console.error(err)
      return json(res, 500, { error: 'Failed to delete hat' })
    }
  }

  return methodNotAllowed(res, ['GET', 'PUT', 'PATCH', 'DELETE'])
}