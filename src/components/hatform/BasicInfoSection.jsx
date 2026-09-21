// Path: src/components/hatform/BasicInfoSection.jsx
import { memo, useEffect, useId, useRef, useState } from 'react'
import { api } from '../../lib/api'
import { HAT_DESCRIPTION_MAX, HAT_NAME_MAX, HAT_TITLE_MAX, HAT_TYPES, OTHER_CATEGORY } from '../../lib/hatForm'
import { CharCount, Field, RadioCards, SelectBox, Section, inputClass } from './formParts'

// Title with the app's existing "Seeking" typeahead (GET /api/hats?suggest=1).
// Suggestions only load while the person is typing — never on the initial
// fill of an existing hat — and out-of-order responses are ignored.
function TitleField({ value, onChange, copy, error, hatRole }) {
  const listId = useId()
  const [suggestions, setSuggestions] = useState([])
  const [open, setOpen] = useState(false)
  const [active, setActive] = useState(-1)
  const typed = useRef(false)
  const requestId = useRef(0)

  useEffect(() => {
    if (!typed.current) return undefined
    const q = value.trim()
    if (q.length < 2) {
      setSuggestions([])
      return undefined
    }
    const id = ++requestId.current
    const timer = setTimeout(async () => {
      try {
        const data = await api.getSeekingSuggestions(hatRole, q)
        if (id === requestId.current) {
          setSuggestions((data.suggestions || []).filter((s) => s.toLowerCase() !== q.toLowerCase()))
          setActive(-1)
        }
      } catch {
        if (id === requestId.current) setSuggestions([])
      }
    }, 350)
    return () => clearTimeout(timer)
  }, [value, hatRole])

  const expanded = open && suggestions.length > 0

  function pick(s) {
    typed.current = false
    onChange(s)
    setSuggestions([])
    setOpen(false)
    setActive(-1)
  }

  function onKeyDown(e) {
    if (!expanded) return
    if (e.key === 'ArrowDown') {
      e.preventDefault()
      setActive((i) => (i + 1) % suggestions.length)
    } else if (e.key === 'ArrowUp') {
      e.preventDefault()
      setActive((i) => (i <= 0 ? suggestions.length - 1 : i - 1))
    } else if (e.key === 'Enter' && active >= 0) {
      e.preventDefault()
      pick(suggestions[active])
    } else if (e.key === 'Escape') {
      e.stopPropagation()
      setOpen(false)
    }
  }

  return (
    <Field
      id="hat-title"
      label={copy.titleQuestion}
      hint={copy.titleHint}
      error={error}
      right={<CharCount value={value} max={HAT_TITLE_MAX} />}
    >
      {(a11y) => (
        <div className="relative">
          <input
            {...a11y}
            type="text"
            role="combobox"
            aria-expanded={expanded}
            aria-controls={listId}
            aria-autocomplete="list"
            aria-activedescendant={expanded && active >= 0 ? `${listId}-${active}` : undefined}
            className={inputClass(error)}
            value={value}
            maxLength={HAT_TITLE_MAX + 20 /* allow pasting a bit over so the error explains itself */}
            placeholder={copy.titlePlaceholder}
            autoComplete="off"
            onChange={(e) => {
              typed.current = true
              onChange(e.target.value)
              setOpen(true)
            }}
            onFocus={() => setOpen(true)}
            onBlur={() => setTimeout(() => setOpen(false), 150)}
            onKeyDown={onKeyDown}
          />
          {expanded && (
            <ul
              id={listId}
              role="listbox"
              aria-label="Suggestions"
              className="absolute z-10 mt-1.5 w-full max-h-52 overflow-auto rounded-[14px] border-[1.5px] border-black bg-white shadow-[0_8px_20px_rgba(0,0,0,0.1)]"
            >
              {suggestions.map((s, i) => (
                <li key={s} id={`${listId}-${i}`} role="option" aria-selected={i === active}>
                  <button
                    type="button"
                    tabIndex={-1}
                    onMouseDown={(e) => {
                      e.preventDefault()
                      pick(s)
                    }}
                    className={`w-full text-left px-3.5 py-2.5 text-[14px] font-medium transition ${i === active ? 'bg-[#F5F3EF]' : 'hover:bg-[#F5F3EF]'}`}
                  >
                    {s}
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </Field>
  )
}

function BasicInfoSection({
  copy,
  hatRole,
  handle,
  roleLocked,
  canChooseRole,
  onRoleChange,
  hatName,
  title,
  category,
  customCategory,
  description,
  skills,
  hatType,
  verifiedName,
  categories,
  errors,
  onChange,
}) {
  const [moreOpen, setMoreOpen] = useState(Boolean(skills || verifiedName))
  const known = categories.some((c) => c.name === category)
  const options = !category || category === OTHER_CATEGORY || known ? categories : [...categories, { name: category }]

  return (
    <Section id="hat-section-basic" title="Basic information">
      {canChooseRole ? (
        <RadioCards
          name="hat-role"
          idPrefix="hat-role"
          legend="What is this Hat for?"
          value={hatRole}
          onChange={onRoleChange}
          columns={2}
          options={[
            { value: 'talent', label: 'Seeking', hint: 'Offer my services' },
            { value: 'client', label: 'Hiring', hint: 'Find talent' },
          ]}
        />
      ) : (
        <p className="flex flex-wrap items-center gap-2 text-[13px] font-semibold">
          <span className={`inline-flex items-center rounded-full border-[1.5px] border-black px-2.5 py-0.5 text-[12px] font-bold text-white ${hatRole === 'client' ? 'bg-black' : 'bg-[#0A13E6]'}`}>
            {copy.listingLabel}
          </span>
          <span className="text-black/60 font-medium">
            {roleLocked ? `${copy.accountLabel} Hat` : ''} {handle ? `· ${handle}` : ''}
          </span>
        </p>
      )}

      <Field
        id="hat-name"
        label={copy.nameQuestion}
        hint={copy.nameHint}
        error={errors.hatName}
        right={<CharCount value={hatName} max={HAT_NAME_MAX} />}
      >
        {(a11y) => (
          <input
            {...a11y}
            type="text"
            className={inputClass(errors.hatName)}
            value={hatName}
            maxLength={HAT_NAME_MAX + 20 /* allow pasting a bit over so the error explains itself */}
            placeholder={copy.namePlaceholder}
            onChange={(e) => onChange('hatName', e.target.value)}
          />
        )}
      </Field>

      <TitleField value={title} onChange={(v) => onChange('title', v)} copy={copy} error={errors.title} hatRole={hatRole} />

      <div className="grid gap-4 md:grid-cols-2">
        <div className="min-w-0 space-y-3">
          <Field id="hat-category" label="Category" error={errors.category}>
            {(a11y) => (
              <SelectBox {...a11y} error={errors.category} value={category} onChange={(e) => onChange('category', e.target.value)}>
                <option value="">Choose a category…</option>
                {options.map((c) => (
                  <option key={c.name} value={c.name}>
                    {c.name}
                  </option>
                ))}
                <option value={OTHER_CATEGORY}>Other (type your own)</option>
              </SelectBox>
            )}
          </Field>
          {category === OTHER_CATEGORY && (
            <Field id="hat-category-custom" label="Your category" error={errors.categoryCustom}>
              {(a11y) => (
                <input
                  {...a11y}
                  type="text"
                  className={inputClass(errors.categoryCustom)}
                  value={customCategory}
                  maxLength={60}
                  placeholder="e.g. Drone pilots"
                  onChange={(e) => onChange('customCategory', e.target.value)}
                />
              )}
            </Field>
          )}
        </div>
        <Field id="hat-type" label="Hat type">
          {(a11y) => (
            <SelectBox {...a11y} value={hatType} onChange={(e) => onChange('hatType', e.target.value)}>
              {HAT_TYPES.map((t) => (
                <option key={t} value={t}>
                  {t}
                </option>
              ))}
            </SelectBox>
          )}
        </Field>
      </div>

      <Field
        id="hat-description"
        label="Description"
        optional
        hint={copy.descriptionHint}
        right={<CharCount value={description} max={HAT_DESCRIPTION_MAX} alwaysShow />}
      >
        {(a11y) => (
          <textarea
            {...a11y}
            rows={2}
            maxLength={HAT_DESCRIPTION_MAX}
            className={`${inputClass(false)} resize-none`}
            value={description}
            placeholder={copy.descriptionPlaceholder}
            onChange={(e) => onChange('description', e.target.value)}
          />
        )}
      </Field>

      <div>
        <button
          type="button"
          aria-expanded={moreOpen}
          aria-controls="hat-more-details"
          onClick={() => setMoreOpen((v) => !v)}
          className="text-[13px] font-semibold text-[#0A13E6] underline underline-offset-2 min-h-[44px]"
        >
          {moreOpen ? 'Hide more details' : 'Add skills or a business name (optional)'}
        </button>
        {moreOpen && (
          <div id="hat-more-details" className="grid gap-4 md:grid-cols-2 mt-1">
            <Field id="hat-skills" label="Skills" optional hint="Separate with commas.">
              {(a11y) => (
                <input {...a11y} type="text" className={inputClass(false)} value={skills} placeholder="Photo editing, Lighting" onChange={(e) => onChange('skills', e.target.value)} />
              )}
            </Field>
            <Field id="hat-verified-name" label="Business name" optional hint="Ending in Ltd, Plc, Corp, Inc or LLC earns a verified badge.">
              {(a11y) => (
                <input {...a11y} type="text" className={inputClass(false)} value={verifiedName} placeholder="e.g. Acme Studios Ltd" onChange={(e) => onChange('verifiedName', e.target.value)} />
              )}
            </Field>
          </div>
        )}
      </div>
    </Section>
  )
}

export default memo(BasicInfoSection)
