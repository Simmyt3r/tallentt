// Path: src/components/profile/EditProfileForm.jsx
import { useEffect, useRef, useState } from 'react'
import { Camera, ShieldCheck, Landmark, CheckCircle2, Sparkles } from 'lucide-react'
import { useAuth } from '../../context/AuthContext.jsx'
import { api, uploadToCloudinary } from '../../lib/api.js'
import { compressImageFile } from '../../lib/media.js'
import { cldImage } from '../../lib/cloudinary.js'
import { COMPANY_SUFFIXES, isBusinessIdentity } from '../../lib/profile.js'

const MAX_BIO = 280
const MAX_HEADLINE = 80

function Field({ label, required, children, hint }) {
  return (
    <label className="block space-y-1.5">
      <span className="tw-label">
        {label} {required && <span className="text-red-500 normal-case">*</span>}
      </span>
      {children}
      {hint && <p className="text-[10px] text-black/40 mt-1 font-medium">{hint}</p>}
    </label>
  )
}

// This is the same account-settings form that has always lived at
// /profile, moved into its own component and extended with the Profile
// UX identity fields (headline/skills/industry/suffix/website) — the
// username/avatar/bio/location/NIN/payout logic below is unchanged from
// before (see section 46: preserve existing account editing).
export default function EditProfileForm({ user, onCancel, onSaved }) {
  const { updateProfile } = useAuth()
  const isBusiness = isBusinessIdentity(user.role)

  const [username, setUsername] = useState(user?.username || '')
  const [usernameStatus, setUsernameStatus] = useState(null) // checking | available | taken | invalid | unchanged
  const [phone, setPhone] = useState(user?.phone || '')
  const [bio, setBio] = useState(user?.bio || '')
  const [location, setLocation] = useState(user?.location || '')
  const [country, setCountry] = useState(user?.country || '')
  const [lga, setLga] = useState(user?.lga || '')
  const [nin, setNin] = useState('')
  const [avatarUrl, setAvatarUrl] = useState(user?.avatarUrl || '')
  const [uploadingAvatar, setUploadingAvatar] = useState(false)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const usernameDebounce = useRef(null)

  // Profile UX identity fields.
  const [headline, setHeadline] = useState(user?.headline || '')
  const [skillsInput, setSkillsInput] = useState((user?.skills || []).join(', '))
  const [industryInput, setIndustryInput] = useState((user?.industry || []).join(', '))
  const [companySuffix, setCompanySuffix] = useState(user?.companySuffix || '')
  const [website, setWebsite] = useState(user?.website || '')

  // Payout details
  const [banks, setBanks] = useState([])
  const [banksLoading, setBanksLoading] = useState(false)
  const [bankCode, setBankCode] = useState('')
  const [accountNumber, setAccountNumber] = useState('')
  const [resolvedName, setResolvedName] = useState('')
  const [resolving, setResolving] = useState(false)
  const [payoutError, setPayoutError] = useState('')
  const resolveDebounce = useRef(null)

  useEffect(() => {
    const u = username.trim().replace(/^@/, '')
    if (!u) {
      setUsernameStatus(null)
      return
    }
    if (u.toLowerCase() === (user?.username || '').toLowerCase()) {
      setUsernameStatus('unchanged')
      return
    }
    setUsernameStatus('checking')
    clearTimeout(usernameDebounce.current)
    usernameDebounce.current = setTimeout(async () => {
      try {
        const data = await api.usernameCheck(u)
        setUsernameStatus(data.status)
      } catch {
        setUsernameStatus('invalid')
      }
    }, 600)
    return () => clearTimeout(usernameDebounce.current)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [username])

  useEffect(() => {
    setResolvedName('')
    setPayoutError('')
    if (!bankCode || !/^\d{10}$/.test(accountNumber)) return
    setResolving(true)
    clearTimeout(resolveDebounce.current)
    resolveDebounce.current = setTimeout(async () => {
      try {
        const data = await api.resolveBankAccount(accountNumber, bankCode)
        setResolvedName(data.accountName)
      } catch (err) {
        setPayoutError(err.message)
      } finally {
        setResolving(false)
      }
    }, 500)
    return () => clearTimeout(resolveDebounce.current)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [bankCode, accountNumber])

  useEffect(() => {
    if (banks.length === 0) {
      setBanksLoading(true)
      api
        .getBanks()
        .then((data) => setBanks(data.banks || []))
        .catch(() => setPayoutError('Could not load the bank list. Try again shortly.'))
        .finally(() => setBanksLoading(false))
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const initials = (user.fullName || user.username || '?')
    .trim()
    .split(/\s+/)
    .map((w) => w[0])
    .join('')
    .slice(0, 2)
    .toUpperCase()

  async function onAvatarFile(e) {
    const file = e.target.files?.[0]
    if (!file) return
    setUploadingAvatar(true)
    setError('')
    try {
      const toUpload = await compressImageFile(file)
      const uploaded = await uploadToCloudinary(toUpload)
      setAvatarUrl(uploaded.url)
    } catch (err) {
      setError(err.message)
    } finally {
      setUploadingAvatar(false)
      e.target.value = ''
    }
  }

  async function onSave(e) {
    e.preventDefault()
    setError('')
    const u = username.trim().replace(/^@/, '')
    if (!u) {
      setError('Username is required.')
      return
    }
    if (usernameStatus !== 'available' && usernameStatus !== 'unchanged') {
      setError(usernameStatus === 'taken' ? 'That username is taken.' : 'Choose a valid, available username.')
      return
    }
    if (nin && !/^\d{11}$/.test(nin.trim())) {
      setError('NIN must be exactly 11 digits.')
      return
    }
    if (accountNumber && !bankCode) {
      setError('Choose a bank for your account number.')
      return
    }
    if (bankCode && !/^\d{10}$/.test(accountNumber)) {
      setError('Account number must be exactly 10 digits.')
      return
    }
    if (bankCode && accountNumber && !resolvedName) {
      setError(resolving ? 'Still verifying that account — wait a moment and try again.' : payoutError || 'Could not verify that account number.')
      return
    }
    if (headline.trim().length > MAX_HEADLINE) {
      setError(`Headline must be ${MAX_HEADLINE} characters or fewer.`)
      return
    }
    if (website.trim() && !/^https?:\/\/.+\..+/i.test(website.trim())) {
      setError('Website must be a valid link starting with http:// or https://')
      return
    }
    setSaving(true)
    try {
      const selectedBank = banks.find((b) => b.code === bankCode)
      await updateProfile({
        username: u,
        phone: phone.trim() || undefined,
        bio: bio.trim(),
        location: location.trim() || undefined,
        country: country.trim() || undefined,
        lga: lga.trim() || undefined,
        avatarUrl: avatarUrl || undefined,
        nin: nin.trim() || undefined,
        bankCode: bankCode || undefined,
        bankName: selectedBank?.name || undefined,
        accountNumber: accountNumber || undefined,
        headline: headline.trim(),
        website: website.trim(),
        ...(isBusiness
          ? { industry: industryInput.split(',').map((s) => s.trim()).filter(Boolean), companySuffix }
          : { skills: skillsInput.split(',').map((s) => s.trim()).filter(Boolean) }),
      })
      setNin('')
      onSaved?.()
    } catch (err) {
      setError(err.message)
    } finally {
      setSaving(false)
    }
  }

  return (
    <form
      onSubmit={onSave}
      className="max-w-[560px] mx-auto bg-white rounded-[24px] border-[1.5px] border-black p-6 shadow-[0_8px_24px_rgba(0,0,0,0.06)] space-y-5"
    >
      <h1 className="text-[20px] font-bold tracking-tight">Edit profile</h1>

      <div className="flex items-center gap-4">
        <div className="relative w-16 h-16 shrink-0">
          <div className="w-16 h-16 rounded-full border-[1.5px] border-black bg-black text-white flex items-center justify-center text-[18px] font-bold overflow-hidden">
            {avatarUrl ? (
              <img src={cldImage(avatarUrl, { w: 128, h: 128 })} alt="" className="w-full h-full object-cover" />
            ) : (
              initials
            )}
          </div>
          <label className="absolute -bottom-1 -right-1 w-6 h-6 rounded-full bg-[#0A13E6] border-[1.5px] border-black flex items-center justify-center cursor-pointer">
            <Camera size={12} className="text-white" />
            <input type="file" accept="image/*" className="hidden" onChange={onAvatarFile} disabled={uploadingAvatar} />
          </label>
        </div>
        <p className="text-[12px] text-black/50 font-medium">
          {uploadingAvatar ? 'Uploading…' : `Tap the camera to change your ${isBusiness ? 'logo' : 'photo'}`}
        </p>
      </div>

      <Field label="Username" required>
        <div className="relative">
          <span className="absolute left-3 top-1/2 -translate-y-1/2 text-black/40 font-medium select-none">@</span>
          <input
            className="tw-input pl-6"
            value={username}
            onChange={(e) => setUsername(e.target.value.replace(/\s/g, ''))}
            autoComplete="username"
            maxLength={30}
            required
          />
        </div>
        {usernameStatus === 'checking' && <p className="text-[11px] text-black/40 mt-1 font-medium">Checking…</p>}
        {usernameStatus === 'available' && <p className="text-[11px] text-green-600 mt-1 font-medium">Available</p>}
        {usernameStatus === 'taken' && <p className="text-[11px] text-red-600 mt-1 font-medium">Already taken</p>}
        {usernameStatus === 'invalid' && (
          <p className="text-[11px] text-red-600 mt-1 font-medium">3–30 chars: letters, numbers, . _ -</p>
        )}
      </Field>

      <div className="rounded-[16px] border-[1.5px] border-black/10 p-4 space-y-4">
        <p className="tw-label flex items-center gap-1.5">
          <Sparkles size={13} /> Professional identity
        </p>

        <Field label={`Headline (${headline.length}/${MAX_HEADLINE})`} hint={isBusiness ? 'e.g. Technology Company' : 'e.g. Photographer & Video Editor'}>
          <input className="tw-input" maxLength={MAX_HEADLINE} value={headline} onChange={(e) => setHeadline(e.target.value)} />
        </Field>

        {isBusiness ? (
          <>
            <Field label="Industry (comma-separated)" hint="Shown as your business areas">
              <input
                className="tw-input"
                value={industryInput}
                onChange={(e) => setIndustryInput(e.target.value)}
                placeholder="Technology, Software Development, Education"
              />
            </Field>
            <Field label="Business suffix">
              <select className="tw-input" value={companySuffix} onChange={(e) => setCompanySuffix(e.target.value)}>
                <option value="">No suffix</option>
                {COMPANY_SUFFIXES.map((s) => (
                  <option key={s} value={s}>
                    {s}
                  </option>
                ))}
              </select>
            </Field>
          </>
        ) : (
          <Field label="Skills (comma-separated)" hint="Shown as chips on your profile">
            <input
              className="tw-input"
              value={skillsInput}
              onChange={(e) => setSkillsInput(e.target.value)}
              placeholder="Photography, Video Editing, Lighting"
            />
          </Field>
        )}

        <Field label="Website" hint="Optional — a portfolio site or other professional link">
          <input
            type="url"
            className="tw-input"
            value={website}
            onChange={(e) => setWebsite(e.target.value)}
            placeholder="https://…"
          />
        </Field>
      </div>

      <Field label="Phone">
        <input className="tw-input" value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="+234…" />
      </Field>

      <Field label={`Bio (${bio.length}/${MAX_BIO})`}>
        <textarea
          className="tw-input min-h-[80px] resize-none"
          maxLength={MAX_BIO}
          value={bio}
          onChange={(e) => setBio(e.target.value)}
          placeholder="A short line about you"
        />
      </Field>

      <div className="grid grid-cols-2 gap-3">
        <Field label="Country">
          <input className="tw-input" value={country} onChange={(e) => setCountry(e.target.value)} />
        </Field>
        <Field label="LGA / City">
          <input className="tw-input" value={lga} onChange={(e) => setLga(e.target.value)} />
        </Field>
      </div>

      <Field label="Location">
        <input className="tw-input" value={location} onChange={(e) => setLocation(e.target.value)} placeholder="Neighbourhood, city" />
      </Field>

      <Field label="NIN (National Identification Number)">
        <input
          className="tw-input"
          inputMode="numeric"
          maxLength={11}
          value={nin}
          onChange={(e) => setNin(e.target.value.replace(/\D/g, ''))}
          placeholder={user.ninVerified ? `On file · ending in ${user.ninLast4}` : 'Enter your 11-digit NIN'}
        />
        <p className="text-[10px] text-black/40 mt-1.5 font-medium flex items-center gap-1">
          <ShieldCheck size={12} />
          We store a one-way hash, never the number itself. Leave blank to keep what's on file.
        </p>
      </Field>

      <div className="rounded-[16px] border-[1.5px] border-black/10 p-4 space-y-3">
        <p className="tw-label flex items-center gap-1.5">
          <Landmark size={13} /> Payout bank account
        </p>
        {user.payoutReady && !bankCode && (
          <p className="text-[12px] text-black/60 font-medium flex items-center gap-1.5">
            <CheckCircle2 size={13} className="text-green-600" />
            On file: {user.bankName} ···· {user.accountNumber?.slice(-4)} ({user.accountName})
          </p>
        )}
        <div className="grid grid-cols-2 gap-3">
          <label className="block space-y-1.5">
            <span className="text-[11px] text-black/50 font-medium">Bank</span>
            <select className="tw-input" value={bankCode} onChange={(e) => setBankCode(e.target.value)} disabled={banksLoading}>
              <option value="">{banksLoading ? 'Loading banks…' : 'Select bank'}</option>
              {banks.map((b) => (
                <option key={b.code} value={b.code}>
                  {b.name}
                </option>
              ))}
            </select>
          </label>
          <label className="block space-y-1.5">
            <span className="text-[11px] text-black/50 font-medium">Account number</span>
            <input
              className="tw-input"
              inputMode="numeric"
              maxLength={10}
              value={accountNumber}
              onChange={(e) => setAccountNumber(e.target.value.replace(/\D/g, ''))}
              placeholder="10-digit NUBAN"
            />
          </label>
        </div>
        {resolving && <p className="text-[11px] text-black/40 font-medium">Verifying account…</p>}
        {resolvedName && (
          <p className="text-[12px] text-green-700 font-semibold flex items-center gap-1.5">
            <CheckCircle2 size={13} /> {resolvedName}
          </p>
        )}
        {!resolving && payoutError && <p className="text-[11px] text-red-600 font-medium">{payoutError}</p>}
        <p className="text-[10px] text-black/40 font-medium">
          This is where escrow payments get released to once a client marks a booking complete. Leave blank to keep what's on file.
        </p>
      </div>

      {error && (
        <div className="rounded-[12px] border-[1.5px] border-red-200 bg-red-50 px-4 py-2.5 text-[13px] font-medium text-red-700">
          {error}
        </div>
      )}

      <div className="flex gap-3">
        <button type="submit" disabled={saving || uploadingAvatar} className="tw-btn-primary flex-1 disabled:opacity-60">
          {saving ? 'Saving…' : 'Save changes'}
        </button>
        <button type="button" onClick={onCancel} className="tw-btn-ghost">
          Cancel
        </button>
      </div>
    </form>
  )
}
