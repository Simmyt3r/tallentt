// Path: src/components/hatform/BasicInfoSection.jsx
import { memo, useEffect, useId, useRef, useState } from 'react'
import { api } from '../../lib/api'
import { HAT_DESCRIPTION_MAX, HAT_NAME_MAX, HAT_TITLE_MAX, HAT_TYPES, HIRING_DURATIONS, OTHER_CATEGORY } from '../../lib/hatForm'
import { CharCount, Field, RadioCards, SelectBox, Section, inputClass } from './formParts'

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
            maxLength={HAT_TITLE_MAX + 20}
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
              className="absolute z-20 mt-1.5 w-full max-h-52 overflow-auto rounded-[14px] border-[1.5px] border-black bg-white shadow-[0_8px_20px_rgba(0,0,0,0.1)]"
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

function CategoryField({ category, customCategory, categories, error, onChange }) {
  const listId = useId()
  const value = category === OTHER_CATEGORY ? customCategory : category

  function update(next) {
    const clean = next.trim()
    const exact = categories.find((item) => item.name.toLowerCase() === clean.toLowerCase())
    if (exact) {
      onChange('category', exact.name)
      onChange('customCategory', '')
      return
    }
    onChange('category', OTHER_CATEGORY)
    onChange('customCategory', next)
  }

  return (
    <Field id="hat-category" label="Category" error={error}>
      {(a11y) => (
        <>
          <input
            {...a11y}
            type="search"
            list={listId}
            className={inputClass(error)}
            value={value}
            maxLength={60}
            placeholder="Search or type a category"
            autoComplete="off"
            onChange={(e) => update(e.target.value)}
          />
          <datalist id={listId}>
            {categories.map((item) => (
              <option key={item.name} value={item.name} />
            ))}
          </datalist>
        </>
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
  hatType,
  hiringDuration,
  categories,
  errors,
  onChange,
}) {
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
        label="Name of Hat"
        error={errors.hatName}
        right={<CharCount value={hatName} max={HAT_NAME_MAX} />}
      >
        {(a11y) => (
          <input
            {...a11y}
            type="text"
            className={inputClass(errors.hatName)}
            value={hatName}
            maxLength={HAT_NAME_MAX + 20}
            placeholder={copy.namePlaceholder}
            onChange={(e) => onChange('hatName', e.target.value)}
          />
        )}
      </Field>

      <TitleField value={title} onChange={(v) => onChange('title', v)} copy={copy} error={errors.title} hatRole={hatRole} />

      <div className="grid gap-4 md:grid-cols-2">
        <CategoryField
          category={category}
          customCategory={customCategory}
          categories={categories}
          error={errors.category || errors.categoryCustom}
          onChange={onChange}
        />
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

      {hatRole === 'client' && (
        <Field id="hat-hiring-duration" label="Hiring duration" error={errors.hiringDuration}>
          {(a11y) => (
            <SelectBox
              {...a11y}
              error={errors.hiringDuration}
              value={hiringDuration}
              onChange={(e) => onChange('hiringDuration', e.target.value)}
            >
              <option value="">Choose duration…</option>
              {HIRING_DURATIONS.map((duration) => (
                <option key={duration} value={duration}>
                  {duration}
                </option>
              ))}
            </SelectBox>
          )}
        </Field>
      )}

      <Field
        id="hat-description"
        label="Tagline"
        optional
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
    </Section>
  )
}

export default memo(BasicInfoSection)
