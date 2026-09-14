import { useEffect, useRef, useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { Upload, X, Sparkles } from 'lucide-react'
import { api, uploadToCloudinary } from '../lib/api'
import { useAuth } from '../context/AuthContext'
import { compressImageFile } from '../lib/media'
import { cldImage, cldVideoPoster } from '../lib/cloudinary'

const COUNTRIES = [
  { name: 'Nigeria', flag: '🇳🇬', currency: 'NGN' },
  { name: 'Ghana', flag: '🇬🇭', currency: 'GHS' },
  { name: 'Kenya', flag: '🇰🇪', currency: 'KES' },
  { name: 'South Africa', flag: '🇿🇦', currency: 'ZAR' },
  { name: 'United States', flag: '🇺🇸', currency: 'USD' },
  { name: 'United Kingdom', flag: '🇬🇧', currency: 'GBP' },
]

const HAT_TYPES = ['Full-time', 'Part-time', 'Freelance', 'Contract', 'One-Off']
const DELIVERY_MODES = ['Physical', 'Remote', 'Hybrid']
const RATE_UNITS = [
  { value: 'hr', label: 'Per hour' },
  { value: 'day', label: 'Per day' },
  { value: 'week', label: 'Per week' },
  { value: 'month', label: 'Per month' },
  { value: 'year', label: 'Per year' },
  { value: 'custom', label: 'Custom…' },
]

// 14 MECE Hats Categories — open-ended (custom entries also allowed, and
// get saved so they show up as options for future hats too). This is a
// fallback shown before /api/categories responds; NOT the Orbit score,
// which is a separately computed confidence metric shown on the card.
const DEFAULT_CATEGORIES = [
  'Beauty & Grooming',
  'Fashion & Styling',
  'Photography & Videography',
  'Music & Audio',
  'Performing Arts & Entertainment',
  'Visual Arts, Design & Crafts',
  'Modeling & Acting',
  'Food & Catering',
  'Events & Hospitality',
  'Health, Wellness & Fitness',
  'Home Services & Skilled Trades',
  'Tech & Digital Services',
  'Business, Admin & Professional Services',
  'Education & Training',
]

function fmtMoney(n, currency) {
  if (n === '' || n == null || Number.isNaN(Number(n))) return null
  try {
    return new Intl.NumberFormat('en-NG', { style: 'currency', currency, maximumFractionDigits: 0 }).format(
      Number(n),
    )
  } catch {
    return `${currency} ${Number(n).toLocaleString()}`
  }
}

export default function HatForm() {
  const navigate = useNavigate()
  const [params] = useSearchParams()
  const editId = params.get('edit')
  const { user } = useAuth()

  const [role, setRole] = useState('talent')

  // Seeking field (role-aware "hat title") + typeahead suggestions
  const [hatTitle, setHatTitle] = useState('')
  const [suggestions, setSuggestions] = useState([])
  const [showSuggestions, setShowSuggestions] = useState(false)
  const suggestDebounce = useRef(null)

  const [verifiedName, setVerifiedName] = useState('')

  // Category
  const [categories, setCategories] = useState(DEFAULT_CATEGORIES.map((name) => ({ name })))
  const [category, setCategory] = useState('')
  const [customCategory, setCustomCategory] = useState('')

  const [skills, setSkills] = useState('')
  const [hatType, setHatType] = useState('Freelance')

  // Location
  const [country, setCountry] = useState(COUNTRIES[0])
  const [lga, setLga] = useState('')

  // Daily availability window, e.g. 15:00 – 17:00
  const [availableFrom, setAvailableFrom] = useState('')
  const [availableTo, setAvailableTo] = useState('')

  // Delivery mode
  const [deliveryMode, setDeliveryMode] = useState('Remote')

  // Price settings
  const [priceType, setPriceType] = useState('fixed')
  const [rate, setRate] = useState('')
  const [rateUnit, setRateUnit] = useState('hr')
  const [rateUnitCustom, setRateUnitCustom] = useState('')
  const [priceMin, setPriceMin] = useState('')
  const [priceMax, setPriceMax] = useState('')
  const [negotiable, setNegotiable] = useState(false)

  const [motto, setMotto] = useState('')
  const [media, setMedia] = useState([])
  const [uploading, setUploading] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState('')
  const [portfolioError, setPortfolioError] = useState(false)

  useEffect(() => {
    api
      .getCategories()
      .then((d) => {
        if (d.categories?.length) setCategories(d.categories)
      })
      .catch(() => {})
  }, [])

  // Seeking-field suggestions — debounced, pulled from the opposite role
  // (client typing sees phrasing talents already use, and vice versa).
  useEffect(() => {
    clearTimeout(suggestDebounce.current)
    if (!hatTitle.trim()) {
      setSuggestions([])
      return
    }
    suggestDebounce.current = setTimeout(async () => {
      try {
        const d = await api.getSeekingSuggestions(role, hatTitle.trim())
        setSuggestions(d.suggestions || [])
      } catch {
        setSuggestions([])
      }
    }, 350)
    return () => clearTimeout(suggestDebounce.current)
  }, [hatTitle, role])

  useEffect(() => {
    if (!editId) return
    api
      .getHat(editId)
      .then(({ hat }) => {
        setRole(hat.role || 'talent')
        setHatTitle(hat.hat_title || '')
        setVerifiedName(hat.verified_name || '')
        setCategory(hat.category || '')
        setSkills((hat.skills || []).join(', '))
        setHatType(hat.hat_type || 'Freelance')
        const c = COUNTRIES.find((x) => x.name === hat.country) || COUNTRIES[0]
        setCountry(c)
        setLga(hat.lga || '')
        setAvailableFrom(hat.available_from ? hat.available_from.slice(0, 5) : '')
        setAvailableTo(hat.available_to ? hat.available_to.slice(0, 5) : '')
        setDeliveryMode(hat.delivery_mode || 'Remote')
        setPriceType(hat.price_type || 'fixed')
        setRate(hat.rate != null ? String(hat.rate) : '')
        setRateUnit(hat.rate_unit || 'hr')
        setRateUnitCustom(hat.rate_unit_custom || '')
        setPriceMin(hat.price_min != null ? String(hat.price_min) : '')
        setPriceMax(hat.price_max != null ? String(hat.price_max) : '')
        setNegotiable(Boolean(hat.price_negotiable))
        setMotto(hat.motto || '')
        setMedia(hat.media || [])
      })
      .catch((e) => setError(e.message))
  }, [editId])

  async function onFile(e) {
    const files = Array.from(e.target.files || [])
    if (!files.length) return
    setUploading(true)
    setPortfolioError(false)
    try {
      const uploaded = []
      for (const f of files) {
        const toUpload = await compressImageFile(f)
        const m = await uploadToCloudinary(toUpload)
        uploaded.push(m)
      }
      setMedia((prev) => [...prev, ...uploaded])
    } catch (err) {
      setError(err.message)
    } finally {
      setUploading(false)
      e.target.value = ''
    }
  }

  function removeMedia(idx) {
    setMedia((prev) => prev.filter((_, i) => i !== idx))
  }

  function pickSuggestion(s) {
    setHatTitle(s)
    setShowSuggestions(false)
  }

  const pricePreview = (() => {
    if (priceType === 'fixed') {
      const amount = fmtMoney(rate, country.currency)
      if (!amount) return null
      const unit = rateUnit === 'custom' ? rateUnitCustom.trim() : RATE_UNITS.find((u) => u.value === rateUnit)?.label
      return unit ? `${amount} · ${unit}` : amount
    }
    const min = fmtMoney(priceMin, country.currency)
    const max = fmtMoney(priceMax, country.currency)
    if (!min) return null
    const base = max && priceMax !== priceMin ? `${min} – ${max}` : min
    return negotiable ? `${base} · Open to negotiation` : base
  })()

  async function onSubmit(e) {
    e.preventDefault()
    setError('')
    if (role === 'talent' && media.length === 0) {
      setPortfolioError(true)
      setError('Portfolio media is required for Talent hats')
      return
    }
    const finalCategory = customCategory.trim() || category
    if (!finalCategory) {
      setError('Select or enter a category')
      return
    }
    if (!hatTitle.trim()) {
      setError(role === 'client' ? 'Enter what you’re seeking' : 'Enter what you’re seeking as talent')
      return
    }
    if (priceType === 'fixed') {
      if (!rate || Number(rate) <= 0) {
        setError('Enter a fixed rate greater than 0.')
        return
      }
      if (rateUnit === 'custom' && !rateUnitCustom.trim()) {
        setError('Enter a label for the custom rate unit.')
        return
      }
    } else {
      if (!priceMin || Number(priceMin) <= 0) {
        setError('Enter a minimum price greater than 0.')
        return
      }
      if (!priceMax || Number(priceMax) < Number(priceMin)) {
        setError('Enter a maximum price greater than or equal to the minimum.')
        return
      }
    }

    setSubmitting(true)
    try {
      if (customCategory.trim() && !categories.some((c) => c.name === customCategory.trim())) {
        await api.createCategory(customCategory.trim()).catch(() => {})
      }
      const body = {
        hat_title: hatTitle.trim(),
        verified_name: verifiedName || undefined,
        category: finalCategory,
        skills: skills
          .split(',')
          .map((s) => s.trim())
          .filter(Boolean),
        hat_type: hatType,
        delivery_mode: deliveryMode,
        country: country.name,
        country_flag: country.flag,
        currency: country.currency,
        lga,
        available_from: availableFrom || undefined,
        available_to: availableTo || undefined,
        motto: motto.slice(0, 80),
        price_type: priceType,
        rate: priceType === 'fixed' ? Number(rate) : undefined,
        rate_unit: priceType === 'fixed' ? rateUnit : undefined,
        rate_unit_custom: priceType === 'fixed' && rateUnit === 'custom' ? rateUnitCustom.trim() : undefined,
        price_min: priceType === 'range' ? Number(priceMin) : undefined,
        price_max: priceType === 'range' ? Number(priceMax) : undefined,
        price_negotiable: priceType === 'range' ? negotiable : false,
        role,
        media,
        availability: true,
      }
      if (editId) await api.updateHat(editId, body)
      else await api.createHat(body)
      navigate('/my-hats')
    } catch (err) {
      setError(err.message)
    } finally {
      setSubmitting(false)
    }
  }

  const seekingLabel = role === 'client' ? 'Client seeking' : 'Talent seeking'
  const seekingPlaceholder =
    role === 'client' ? 'e.g. Henna artist for bridal shoot' : 'e.g. UI design gigs for SaaS products'

  return (
    <form
      onSubmit={onSubmit}
      className="max-w-[520px] mx-auto space-y-5 bg-white rounded-[24px] border-[1.5px] border-black p-5 md:p-7 shadow-[0_8px_24px_rgba(0,0,0,0.06)]"
    >
      <div>
        <h1 className="text-[20px] font-bold tracking-tight">{editId ? 'Edit Hat' : 'Create Hat'}</h1>
        <p className="text-[12px] text-black/50 mt-0.5 font-medium">A hat is a listing under your account</p>
      </div>

      {/* Role toggle */}
      <div className="flex gap-2 p-1 rounded-full bg-[#F5F3EF] border-[1.5px] border-black">
        {['talent', 'client'].map((r) => (
          <button
            key={r}
            type="button"
            onClick={() => {
              setRole(r)
              setPortfolioError(false)
              setShowSuggestions(false)
            }}
            className={`flex-1 h-10 rounded-full text-[13px] font-semibold capitalize transition ${
              role === r
                ? r === 'talent'
                  ? 'bg-[#0A13E6] text-white border-[1.5px] border-black shadow'
                  : 'bg-black text-white border-[1.5px] border-black shadow'
                : 'text-black/50 hover:text-black'
            }`}
          >
            {r === 'talent' ? 'Talent hat' : 'Client hat'}
          </button>
        ))}
      </div>

      <div className="rounded-[14px] border-[1.5px] border-black/10 bg-[#F5F3EF] px-4 py-3">
        <div className="tw-label mb-1">Account</div>
        <p className="text-[14px] font-semibold">
          @{user?.username || '…'}
          <span className="ml-2 text-[11px] font-medium text-black/40 normal-case tracking-normal">
            from your signed-in profile — not editable per hat
          </span>
        </p>
      </div>

      {/* Seeking field — role-aware label + typeahead, custom text always allowed */}
      <Field label={seekingLabel} required>
        <div className="relative">
          <input
            className="tw-input"
            value={hatTitle}
            onChange={(e) => {
              setHatTitle(e.target.value)
              setShowSuggestions(true)
            }}
            onFocus={() => setShowSuggestions(true)}
            onBlur={() => setTimeout(() => setShowSuggestions(false), 150)}
            placeholder={seekingPlaceholder}
            required
            autoComplete="off"
          />
          {showSuggestions && suggestions.length > 0 && (
            <ul className="absolute z-10 mt-1.5 w-full bg-white rounded-[14px] border-[1.5px] border-black shadow-[0_8px_20px_rgba(0,0,0,0.1)] max-h-48 overflow-auto">
              {suggestions.map((s) => (
                <li key={s}>
                  <button
                    type="button"
                    onMouseDown={() => pickSuggestion(s)}
                    className="w-full text-left px-3.5 py-2 text-[13px] font-medium hover:bg-[#F5F3EF] transition"
                  >
                    {s}
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
        <p className="text-[10px] text-black/40 mt-1.5 font-medium">
          {role === 'client'
            ? 'Suggestions are pulled from what talents already offer — type your own too.'
            : 'Suggestions are pulled from what clients are seeking — type your own too.'}
        </p>
      </Field>

      <Field label="Verified name (optional)">
        <input
          className="tw-input"
          value={verifiedName}
          onChange={(e) => setVerifiedName(e.target.value)}
          placeholder="e.g. Acme Studios Ltd"
        />
        <p className="text-[10px] text-black/40 mt-1.5 font-medium">
          Ends with Ltd / Plc / Corp / Inc / LLC → verified badge
        </p>
      </Field>

      {/* Hats Category — 14 MECE taxonomy, open-ended */}
      <Field label="Hats Category" required>
        <select
          className="tw-input appearance-none"
          value={category}
          onChange={(e) => {
            setCategory(e.target.value)
            setCustomCategory('')
          }}
        >
          <option value="">Select category…</option>
          {categories.map((c) => (
            <option key={c.name} value={c.name}>
              {c.name}
            </option>
          ))}
        </select>
        <input
          className="tw-input mt-2"
          placeholder="Or type a custom category"
          value={customCategory}
          onChange={(e) => setCustomCategory(e.target.value)}
        />
      </Field>

      <Field label="Skills (comma-separated)">
        <input className="tw-input" value={skills} onChange={(e) => setSkills(e.target.value)} placeholder="React, Figma, Voice-over" />
      </Field>

      <Field label="Hat Type" required>
        <select className="tw-input appearance-none" value={hatType} onChange={(e) => setHatType(e.target.value)}>
          {HAT_TYPES.map((t) => (
            <option key={t}>{t}</option>
          ))}
        </select>
      </Field>

      {/* Location */}
      <div className="grid grid-cols-2 gap-3">
        <Field label="Country">
          <select
            className="tw-input appearance-none"
            value={country.name}
            onChange={(e) => setCountry(COUNTRIES.find((c) => c.name === e.target.value) || COUNTRIES[0])}
          >
            {COUNTRIES.map((c) => (
              <option key={c.name} value={c.name}>
                {c.flag} {c.name}
              </option>
            ))}
          </select>
        </Field>
        <Field label="LGA / City">
          <input className="tw-input" value={lga} onChange={(e) => setLga(e.target.value)} placeholder="Yaba" />
        </Field>
      </div>

      {/* Daily availability window */}
      <div className="grid grid-cols-2 gap-3">
        <Field label="Available From">
          <input
            type="time"
            className="tw-input"
            value={availableFrom}
            onChange={(e) => setAvailableFrom(e.target.value)}
          />
        </Field>
        <Field label="Available To">
          <input
            type="time"
            className="tw-input"
            value={availableTo}
            onChange={(e) => setAvailableTo(e.target.value)}
          />
        </Field>
      </div>

      {/* Delivery mode */}
      <Field label="Delivery Mode" required>
        <div className="flex gap-2 p-1 rounded-full bg-[#F5F3EF] border-[1.5px] border-black">
          {DELIVERY_MODES.map((m) => (
            <button
              key={m}
              type="button"
              onClick={() => setDeliveryMode(m)}
              className={`flex-1 h-9 rounded-full text-[12px] font-semibold transition ${
                deliveryMode === m ? 'bg-[#0A13E6] text-white border-[1.5px] border-black shadow' : 'text-black/50 hover:text-black'
              }`}
            >
              {m}
            </button>
          ))}
        </div>
      </Field>

      {/* Price settings */}
      <div className="space-y-3">
        <span className="tw-label">Price Settings</span>
        <div className="flex gap-2 p-1 rounded-full bg-[#F5F3EF] border-[1.5px] border-black">
          {[
            { v: 'fixed', label: 'Fixed rate' },
            { v: 'range', label: 'Range' },
          ].map((o) => (
            <button
              key={o.v}
              type="button"
              onClick={() => setPriceType(o.v)}
              className={`flex-1 h-10 rounded-full text-[13px] font-semibold transition ${
                priceType === o.v ? 'bg-[#0A13E6] text-white border-[1.5px] border-black shadow' : 'text-black/50 hover:text-black'
              }`}
            >
              {o.label}
            </button>
          ))}
        </div>

        {priceType === 'fixed' ? (
          <div className="grid grid-cols-2 gap-3">
            <Field label="Rate *" required>
              <input type="number" min="0" className="tw-input" value={rate} onChange={(e) => setRate(e.target.value)} required placeholder="50000" />
            </Field>
            <Field label="Per">
              <select className="tw-input appearance-none" value={rateUnit} onChange={(e) => setRateUnit(e.target.value)}>
                {RATE_UNITS.map((u) => (
                  <option key={u.value} value={u.value}>
                    {u.label}
                  </option>
                ))}
              </select>
            </Field>
            {rateUnit === 'custom' && (
              <div className="col-span-2">
                <Field label="Custom unit label" required>
                  <input
                    className="tw-input"
                    value={rateUnitCustom}
                    onChange={(e) => setRateUnitCustom(e.target.value)}
                    placeholder="e.g. per session"
                    maxLength={24}
                  />
                </Field>
              </div>
            )}
          </div>
        ) : (
          <div className="space-y-3">
            <div className="grid grid-cols-2 gap-3">
              <Field label="Min price *" required>
                <input type="number" min="0" className="tw-input" value={priceMin} onChange={(e) => setPriceMin(e.target.value)} required placeholder="50000" />
              </Field>
              <Field label="Max price *" required>
                <input type="number" min="0" className="tw-input" value={priceMax} onChange={(e) => setPriceMax(e.target.value)} required placeholder="120000" />
              </Field>
            </div>
            <label className="flex items-center gap-2 text-[12px] font-semibold cursor-pointer select-none">
              <input type="checkbox" checked={negotiable} onChange={(e) => setNegotiable(e.target.checked)} className="rounded border-black" />
              Open to negotiation
            </label>
          </div>
        )}

        {pricePreview && (
          <div className="rounded-[12px] border-[1.5px] border-black/10 bg-[#F5F3EF] px-3.5 py-2.5">
            <p className="text-[10px] font-bold uppercase tracking-wide text-black/40">Price preview</p>
            <p className="text-[15px] font-bold mt-0.5">{pricePreview}</p>
          </div>
        )}
      </div>

      <Field label={`Motto (${motto.length}/80)`}>
        <textarea
          className="tw-input min-h-[88px] resize-none"
          maxLength={80}
          value={motto}
          onChange={(e) => setMotto(e.target.value)}
          placeholder="e.g. Rhythm lives in every heartbeat I play."
        />
        <div className="flex items-center gap-1.5 mt-1.5">
          <Sparkles size={12} className="text-violet-600" />
          <span className="text-[10px] font-bold text-violet-700 uppercase tracking-wide">AI-assisted suggestions coming</span>
        </div>
      </Field>

      {/* Media upload — many images/videos/audio; required for Talent, optional for Client */}
      <div className="space-y-2">
        <label className="tw-label flex items-center gap-2 flex-wrap">
          {role === 'talent' ? (
            <>
              Upload Media *
              <span className="normal-case font-semibold text-[10px] px-2 py-0.5 rounded-full bg-red-50 border border-red-200 text-red-700">
                Required for Talent
              </span>
            </>
          ) : (
            <>
              Upload Media
              <span className="normal-case font-medium text-[10px] px-2 py-0.5 rounded-full bg-[#f2f2f1] border border-black/10 text-black/60">
                Optional for Client
              </span>
            </>
          )}
        </label>
        <p className={`text-[10px] font-medium px-0.5 ${portfolioError ? 'text-red-600 font-semibold' : 'text-black/50'}`}>
          {role === 'talent'
            ? 'Portfolio media is required for Talent hats — add as many images, videos, or audio clips as you like.'
            : 'For clients, media is optional — add reference material if it helps.'}
        </p>

        <div
          className={`rounded-[16px] border-[1.5px] border-dashed p-4 transition ${
            portfolioError ? 'border-red-400 ring-4 ring-red-100 bg-red-50/30' : 'border-black/15 bg-[#F5F3EF]/50'
          }`}
        >
          <label className="flex flex-col items-center gap-2 cursor-pointer py-2">
            <div className="w-10 h-10 rounded-full bg-white border-[1.5px] border-black flex items-center justify-center">
              <Upload size={18} />
            </div>
            <span className="text-[12px] font-semibold text-black/70">
              {uploading ? 'Uploading…' : 'Upload images / videos / audio'}
            </span>
            <input type="file" accept="image/*,video/*,audio/*" multiple className="hidden" onChange={onFile} disabled={uploading} />
          </label>

          {media.length > 0 && (
            <div className="mt-3 flex flex-wrap gap-2">
              {media.map((m, i) => (
                <div key={m.public_id || i} className="relative w-20 h-20 rounded-[12px] overflow-hidden bg-white border-[1.5px] border-black/10">
                  {m.type === 'image' || !m.type ? (
                    <img src={cldImage(m.url, { w: 160, h: 160 })} alt="" className="w-full h-full object-cover" />
                  ) : m.type === 'video' ? (
                    <img src={cldVideoPoster(m.url, { w: 160, h: 160 })} alt="" className="w-full h-full object-cover" />
                  ) : (
                    <div className="w-full h-full flex items-center justify-center text-[10px] font-bold uppercase text-black/40">{m.type}</div>
                  )}
                  <button
                    type="button"
                    onClick={() => removeMedia(i)}
                    className="absolute top-1 right-1 w-5 h-5 rounded-full bg-black/70 text-white flex items-center justify-center"
                  >
                    <X size={10} />
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {error && (
        <div className="rounded-[12px] border-[1.5px] border-red-200 bg-red-50 px-4 py-2.5 text-[13px] font-medium text-red-700">{error}</div>
      )}

      <button type="submit" disabled={submitting || uploading} className="tw-btn-primary w-full disabled:opacity-60">
        {submitting ? 'Saving…' : 'Save'}
      </button>
    </form>
  )
}

function Field({ label, required, children }) {
  return (
    <label className="block space-y-1.5">
      <span className="tw-label">
        {label} {required && <span className="text-red-500 normal-case">*</span>}
      </span>
      {children}
    </label>
  )
}