// Path: src/components/HatForm.jsx
//
// Create Hat / Edit Hat — one page, one form, role-aware wording.
// Route: /create (new) and /create?edit=<hatId> (edit). Sections live in
// ./hatform/*; pure logic (validation, payloads, copy) in ../lib/hatForm.js.
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router-dom'
import { Eye } from 'lucide-react'
import { api } from '../lib/api'
import { useAuth } from '../context/AuthContext'
import { showToast } from '../lib/toast'
import {
  DEFAULT_CATEGORIES,
  FIELD_IDS,
  OTHER_CATEGORY,
  buildPayload,
  buildPreview,
  countryByName,
  currencySymbol,
  deriveNewHatRole,
  describeLoadError,
  describeSaveError,
  emptyForm,
  formSignature,
  hydrateForm,
  mediaSignature,
  normalizeHatRole,
  roleCopy,
  summarizeErrors,
  validateForm,
} from '../lib/hatForm'
import Dialog from './hatform/Dialog'
import BasicInfoSection from './hatform/BasicInfoSection'
import MediaSection from './hatform/MediaSection'
import PricingSection from './hatform/PricingSection'
import AvailabilityStatusSection from './hatform/AvailabilityStatusSection'
import AvailabilitySection from './hatform/AvailabilitySection'
import LocationSection from './hatform/LocationSection'
import HatPreview from './hatform/HatPreview'
import { useHatMedia } from './hatform/useHatMedia'
import useLeaveGuard from './hatform/useLeaveGuard'
import { getUsernameLabel } from '../lib/profile.js'

const idToField = Object.fromEntries(Object.entries(FIELD_IDS).map(([field, id]) => [id, field]))

function FormSkeleton() {
  return (
    <div className="max-w-[680px] mx-auto space-y-4" role="status" aria-busy="true">
      <span className="sr-only">Loading your Hat…</span>
      <div className="h-12 w-2/3 rounded-[14px] bg-black/5 animate-pulse" />
      {[0, 1, 2].map((i) => (
        <div key={i} className="h-40 rounded-[20px] border-[1.5px] border-black/10 bg-white animate-pulse" />
      ))}
    </div>
  )
}

function LoadProblem({ message, sessionExpired, onRetry }) {
  return (
    <div className="max-w-[680px] mx-auto rounded-[20px] border-[1.5px] border-black bg-white p-6 text-center space-y-4" role="alert">
      <h1 className="text-[18px] font-bold">Can't open this Hat</h1>
      <p className="text-[13px] font-medium text-black/65">{message}</p>
      <div className="flex flex-wrap justify-center gap-2">
        {onRetry && (
          <button type="button" onClick={onRetry} className="tw-btn-primary px-6">
            Try again
          </button>
        )}
        {sessionExpired && (
          <a href="/auth" target="_blank" rel="noreferrer" className="tw-btn-ghost px-6 inline-flex items-center">
            Sign in
          </a>
        )}
        <Link to="/my-hats" className="tw-btn-ghost px-6 inline-flex items-center">
          Back to My Hats
        </Link>
      </div>
    </div>
  )
}

const prefersReducedMotion = () => typeof window !== 'undefined' && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches

export default function HatForm() {
  const [params] = useSearchParams()
  const editId = params.get('edit') || ''
  // Keyed so switching between "new" and a different hat starts from clean state.
  return <HatFormScreen key={editId || 'new'} editId={editId} />
}

function HatFormScreen({ editId }) {
  const navigate = useNavigate()
  const { user } = useAuth()
  const editing = Boolean(editId)

  const [form, setForm] = useState(() => emptyForm(user))
  const [chosenRole, setChosenRole] = useState('talent') // only used by dual accounts on Create
  const [editRole, setEditRole] = useState('talent') // the hat's own role, fixed once created
  const [categories, setCategories] = useState(() => DEFAULT_CATEGORIES.map((name) => ({ name })))
  const [load, setLoad] = useState({ status: editing ? 'loading' : 'ready' })
  const [reloadKey, setReloadKey] = useState(0)

  const [touched, setTouched] = useState({})
  const [showAllErrors, setShowAllErrors] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [submitError, setSubmitError] = useState(null) // { message, sessionExpired }
  const [previewOpen, setPreviewOpen] = useState(false)
  const [pendingNav, setPendingNav] = useState(null)
  const [leaving, setLeaving] = useState(false)

  const media = useHatMedia()
  const submittingRef = useRef(false)
  const savedIdRef = useRef('') // set once a Create succeeds, so a repeat submit updates instead of duplicating
  const baseline = useRef(null) // signature of the form as loaded/initial
  const baselineMedia = useRef(mediaSignature([], 0))

  // ── Role: the account decides; only dual accounts choose. ──────────────
  const newRole = deriveNewHatRole(user?.role, chosenRole)
  const hatRole = editing ? normalizeHatRole(editRole) : newRole.role
  const canChooseRole = !editing && newRole.canChoose
  const copy = useMemo(() => roleCopy(hatRole), [hatRole])

  if (baseline.current === null && !editing) baseline.current = formSignature(form, hatRole, media.signature)

  // ── Data loading ───────────────────────────────────────────────────────
  useEffect(() => {
    api
      .getCategories()
      .then((d) => {
        if (d.categories?.length) setCategories(d.categories)
      })
      .catch(() => {}) // the built-in list stays as the fallback
  }, [])

  useEffect(() => {
    if (!editing) return undefined
    let cancelled = false
    setLoad({ status: 'loading' })
    api
      .getHat(editId)
      .then(({ hat }) => {
        if (cancelled) return
        if (user?.id && hat.user_id && hat.user_id !== user.id) {
          setLoad({ status: 'forbidden' })
          return
        }
        const next = hydrateForm(hat)
        const role = normalizeHatRole(hat.role)
        const stored = (hat.media || []).filter((m) => m && m.url && m.public_id)
        media.reset(stored)
        setForm(next)
        setEditRole(role)
        baselineMedia.current = mediaSignature(stored.map((m) => m.public_id), 0)
        baseline.current = formSignature(next, role, baselineMedia.current)
        setLoad({ status: 'ready' })
      })
      .catch((err) => {
        if (!cancelled) setLoad({ status: 'error', ...describeLoadError(err) })
      })
    return () => {
      cancelled = true
    }
    // media.reset is stable
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [editId, editing, user?.id, reloadKey])

  // ── Field state ────────────────────────────────────────────────────────
  const setField = useCallback((name, value) => {
    setForm((f) => (f[name] === value ? f : { ...f, [name]: value }))
  }, [])

  const country = countryByName(form.countryName)
  const symbol = useMemo(() => currencySymbol(country.currency), [country.currency])

  // ── Validation: computed continuously, revealed per field once touched ─
  const errors = useMemo(() => validateForm(form, { role: hatRole, media: media.stats }), [form, hatRole, media.stats])
  const visible = useMemo(() => {
    if (showAllErrors) return errors
    const shown = {}
    for (const key of Object.keys(errors)) if (key !== 'media' && touched[key]) shown[key] = errors[key]
    return shown
  }, [errors, showAllErrors, touched])

  const basicErrors = useMemo(
    () => ({
      hatName: visible.hatName,
      title: visible.title,
      category: visible.category,
      categoryCustom: visible.categoryCustom,
      hiringDuration: visible.hiringDuration,
    }),
    [visible.hatName, visible.title, visible.category, visible.categoryCustom, visible.hiringDuration],
  )
  const pricingErrors = useMemo(
    () => ({
      amount: visible.amount,
      priceMin: visible.priceMin,
      priceMax: visible.priceMax,
      rateUnitCustom: visible.rateUnitCustom,
    }),
    [visible.amount, visible.priceMin, visible.priceMax, visible.rateUnitCustom],
  )
  const availabilityErrors = useMemo(
    () => ({ availableDays: visible.availableDays, availableFrom: visible.availableFrom, availableTo: visible.availableTo }),
    [visible.availableDays, visible.availableFrom, visible.availableTo],
  )
  const locationErrors = useMemo(() => ({ deliveryMode: visible.deliveryMode, city: visible.city }), [visible.deliveryMode, visible.city])

  const summary = useMemo(() => (showAllErrors ? summarizeErrors(errors, hatRole) : []), [showAllErrors, errors, hatRole])

  function onBlur(e) {
    const id = e.target?.id || ''
    const field = idToField[id] || (id.startsWith('hat-delivery-') ? 'deliveryMode' : null)
    if (field) setTouched((t) => (t[field] ? t : { ...t, [field]: true }))
  }

  function focusField(field) {
    const el = document.getElementById(FIELD_IDS[field])
    if (!el) return
    el.scrollIntoView({ block: 'center', behavior: prefersReducedMotion() ? 'auto' : 'smooth' })
    el.focus({ preventScroll: true })
  }

  // ── Unsaved changes ────────────────────────────────────────────────────
  const dirty = baseline.current !== null && formSignature(form, hatRole, media.signature) !== baseline.current
  useLeaveGuard(dirty && !leaving, setPendingNav)

  function requestLeave(path) {
    if (dirty && !leaving) setPendingNav(path)
    else navigate(path)
  }

  function confirmDiscard() {
    const to = pendingNav
    setLeaving(true)
    setPendingNav(null)
    navigate(to)
  }

  // ── Submit ─────────────────────────────────────────────────────────────
  async function onSubmit(e) {
    e.preventDefault()
    if (submittingRef.current || media.stats.uploading > 0) return
    setSubmitError(null)
    setShowAllErrors(true)

    const found = validateForm(form, { role: hatRole, media: media.stats })
    const keys = Object.keys(found)
    if (keys.length) {
      focusField(keys[0])
      return
    }

    submittingRef.current = true
    setSubmitting(true)
    const targetId = editId || savedIdRef.current
    try {
      if (form.category === OTHER_CATEGORY) {
        const name = form.customCategory.trim()
        if (!categories.some((c) => c.name === name)) await api.createCategory(name).catch(() => {})
      }
      const mediaChanged = media.signature !== baselineMedia.current
      const body = buildPayload(form, {
        mode: targetId ? 'edit' : 'create',
        role: hatRole,
        media: !targetId || mediaChanged ? media.readyMedia : null,
      })
      if (targetId) {
        await api.updateHat(targetId, body)
      } else {
        const created = await api.createHat(body)
        savedIdRef.current = created?.hat?.id || 'created'
      }
      setLeaving(true) // saved: nothing left to guard
      showToast(editing ? 'Changes saved. Manage feed visibility in My Hats.' : 'Hat created. Turn on Show in feed in My Hats to publish it to the feed.')
      navigate('/my-hats')
    } catch (err) {
      setSubmitError(describeSaveError(err, editing ? 'save' : 'publish'))
    } finally {
      submittingRef.current = false
      setSubmitting(false)
    }
  }

  // ── Render ─────────────────────────────────────────────────────────────
  if (load.status === 'loading') return <FormSkeleton />
  if (load.status === 'error') return <LoadProblem message={load.message} sessionExpired={load.sessionExpired} onRetry={() => setReloadKey((k) => k + 1)} />
  if (load.status === 'forbidden') return <LoadProblem message="You can only edit your own Hats." />

  const uploading = media.stats.uploading > 0
  const submitLabel = submitting ? (editing ? 'Saving…' : 'Publishing…') : uploading ? 'Uploading media…' : editing ? 'Save Changes' : 'Publish Hat'
  const preview = previewOpen ? buildPreview(form, { role: hatRole }) : null

  return (
    <div className="max-w-[680px] mx-auto">
      <header className="flex items-start justify-between gap-3 mb-4">
        <div className="min-w-0">
          <h1 className="text-[20px] font-bold tracking-tight">{editing ? 'Edit Hat' : 'Create Hat'}</h1>
          <p className="text-[12px] text-black/55 font-medium mt-0.5">{editing ? 'Update your Hat' : copy.headerSubtitle}</p>
        </div>
        <button type="button" onClick={() => setPreviewOpen(true)} aria-haspopup="dialog" className="tw-btn-ghost h-11 px-4 text-[13px] inline-flex items-center gap-1.5 shrink-0">
          <Eye size={15} aria-hidden="true" /> Preview
        </button>
      </header>

      <form
        noValidate
        onSubmit={onSubmit}
        onBlur={onBlur}
        onKeyDown={(e) => {
          // Enter in a text box shouldn't publish by accident; the Publish button does that.
          if (e.key === 'Enter' && e.target instanceof HTMLInputElement && !['checkbox', 'radio', 'button', 'submit'].includes(e.target.type)) e.preventDefault()
        }}
        className="space-y-4"
        aria-label={editing ? 'Edit Hat' : 'Create Hat'}
      >
        {summary.length > 0 && (
          <div role="alert" className="rounded-[16px] border-[1.5px] border-red-300 bg-red-50 px-4 py-3">
            <p className="text-[13px] font-bold text-red-700">Please complete:</p>
            <ul className="mt-1 space-y-0.5">
              {summary.map((row) => (
                <li key={row.label}>
                  <button type="button" onClick={() => focusField(row.field)} className="text-[13px] font-semibold text-red-700 underline underline-offset-2 min-h-[32px]">
                    {row.label}
                  </button>
                </li>
              ))}
            </ul>
          </div>
        )}

        <BasicInfoSection
          copy={copy}
          hatRole={hatRole}
          handle={getUsernameLabel(user)}
          roleLocked={editing || !newRole.canChoose}
          canChooseRole={canChooseRole}
          onRoleChange={setChosenRole}
          hatName={form.hatName}
          title={form.title}
          category={form.category}
          customCategory={form.customCategory}
          description={form.description}
          skills={form.skills}
          hatType={form.hatType}
          hiringDuration={form.hiringDuration}
          verifiedName={form.verifiedName}
          categories={categories}
          errors={basicErrors}
          onChange={setField}
        />

        <MediaSection
          items={media.items}
          error={showAllErrors ? errors.media : undefined}
          copy={copy}
          rejected={media.rejected}
          announcement={media.announcement}
          onAddFiles={media.addFiles}
          onRetry={media.retry}
          onRemove={media.remove}
          onMove={media.move}
          onMakeCover={media.makeCover}
          onDismissRejected={media.dismissRejected}
        />

        <PricingSection
          copy={copy}
          currency={country.currency}
          symbol={symbol}
          priceMode={form.priceMode}
          amount={form.amount}
          priceMin={form.priceMin}
          priceMax={form.priceMax}
          rateUnit={form.rateUnit}
          rateUnitCustom={form.rateUnitCustom}
          errors={pricingErrors}
          onChange={setField}
        />

        <AvailabilityStatusSection copy={copy} available={form.available} onChange={setField} />

        <AvailabilitySection
          copy={copy}
          available={form.available}
          availableDays={form.availableDays}
          flexibleHours={form.flexibleHours}
          availableFrom={form.availableFrom}
          availableTo={form.availableTo}
          errors={availabilityErrors}
          onChange={setField}
        />

        <LocationSection countryName={form.countryName} currency={country.currency} city={form.city} deliveryMode={form.deliveryMode} errors={locationErrors} onChange={setField} />

        <div className="sticky bottom-[60px] z-10 -mx-4 px-4 py-3 space-y-2 bg-[#F7F3EB]/95 backdrop-blur border-t-[1.5px] border-black md:static md:mx-0 md:px-0 md:pt-1 md:pb-6 md:bg-transparent md:border-0 md:backdrop-blur-none">
          {submitError && (
            <div role="alert" className="rounded-[14px] border-[1.5px] border-red-300 bg-red-50 px-3.5 py-2.5 text-[13px] font-semibold text-red-700">
              {submitError.message}
              {submitError.sessionExpired && (
                <>
                  {' '}
                  <a href="/auth" target="_blank" rel="noreferrer" className="underline">
                    Sign in
                  </a>
                </>
              )}
            </div>
          )}
          <div className="flex items-center gap-2 md:justify-end">
            <button type="button" onClick={() => requestLeave('/my-hats')} className="tw-btn-ghost hidden md:inline-flex items-center px-6">
              Cancel
            </button>
            <button type="button" onClick={() => setPreviewOpen(true)} aria-haspopup="dialog" className="tw-btn-ghost md:hidden px-5">
              Preview
            </button>
            <button type="submit" disabled={submitting || uploading} aria-busy={submitting} className="tw-btn-primary flex-1 md:flex-none md:px-10 disabled:opacity-60 disabled:hover:bg-[#0A13E6]">
              {submitLabel}
            </button>
          </div>
        </div>
      </form>

      {preview && (
        <HatPreview
          open={previewOpen}
          onClose={() => setPreviewOpen(false)}
          preview={preview}
          cover={media.items[0] || null}
          owner={user}
        />
      )}

      <Dialog open={Boolean(pendingNav)} onClose={() => setPendingNav(null)} variant="alert" role="alertdialog" labelledBy="hat-discard-title" describedBy="hat-discard-text">
        <h2 id="hat-discard-title" className="text-[17px] font-bold">
          Discard changes?
        </h2>
        <p id="hat-discard-text" className="mt-1.5 text-[13px] font-medium text-black/65">
          You have unsaved changes.
        </p>
        <div className="mt-5 flex justify-end gap-2">
          <button type="button" onClick={() => setPendingNav(null)} className="tw-btn-primary px-6" autoFocus>
            Stay
          </button>
          <button type="button" onClick={confirmDiscard} className="tw-btn-ghost px-6 !text-red-600 hover:!bg-red-50">
            Discard
          </button>
        </div>
      </Dialog>
    </div>
  )
}
