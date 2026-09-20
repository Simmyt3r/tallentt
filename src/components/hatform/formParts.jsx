// Path: src/components/hatform/formParts.jsx
import { memo, useLayoutEffect, useRef, useState } from 'react'
import { Check, ChevronDown } from 'lucide-react'
import { caretForDigitCount, groupDigits, hasNegativeSign, sanitizeMoneyInput } from '../../lib/hatForm'

// 16px on phones stops iOS from zooming into the field; 14px matches the rest
// of the app from md up.
export const inputClass = (error) =>
  `tw-input text-[16px] md:text-[14px] min-h-[48px] ${error ? '!border-red-500 focus:!border-red-500' : ''}`

export function Section({ id, title, description, children }) {
  return (
    <section id={id} aria-labelledby={`${id}-title`} className="rounded-[20px] border-[1.5px] border-black bg-white p-4 md:p-5 space-y-4">
      <div>
        <h2 id={`${id}-title`} className="text-[16px] font-bold tracking-tight">
          {title}
        </h2>
        {description && <p className="text-[12px] text-black/55 font-medium mt-0.5">{description}</p>}
      </div>
      {children}
    </section>
  )
}

// Label + control + hint + error, wired together for assistive tech. The
// control is rendered by `children(props)` so it can spread the a11y props.
export function Field({ id, label, optional, hint, error, right, children }) {
  const hintId = hint ? `${id}-hint` : undefined
  const errorId = error ? `${id}-error` : undefined
  const describedBy = [hintId, errorId].filter(Boolean).join(' ') || undefined
  return (
    <div className="min-w-0">
      <div className="flex items-baseline justify-between gap-2 mb-1.5">
        <label htmlFor={id} className="text-[13px] font-semibold text-black/85">
          {label}
          {optional && <span className="ml-1.5 text-[11px] font-medium text-black/45">Optional</span>}
        </label>
        {right}
      </div>
      {children({ id, 'aria-describedby': describedBy, 'aria-invalid': error ? true : undefined })}
      {hint && (
        <p id={hintId} className="text-[11.5px] text-black/50 font-medium mt-1.5">
          {hint}
        </p>
      )}
      {error && (
        <p id={errorId} className="text-[12px] text-red-600 font-semibold mt-1.5">
          {error}
        </p>
      )}
    </div>
  )
}

export function SelectBox({ children, error, ...props }) {
  return (
    <div className="relative">
      <select {...props} className={`${inputClass(error)} appearance-none pr-10`}>
        {children}
      </select>
      <ChevronDown size={16} aria-hidden="true" className="absolute right-3.5 top-1/2 -translate-y-1/2 text-black/50 pointer-events-none" />
    </div>
  )
}

export function CharCount({ value, max, alwaysShow = false }) {
  const used = value.length
  if (!alwaysShow && used < max * 0.75) return null
  return (
    <span className={`text-[11px] font-semibold tabular-nums ${used >= max ? 'text-red-600' : 'text-black/45'}`} aria-live="off">
      {used}/{max}
    </span>
  )
}

// Native radios (so arrow keys, focus and screen readers behave) drawn as
// cards. The selected card carries a check mark and a heavier outline as well
// as colour, so state never depends on colour alone.
export const RadioCards = memo(function RadioCards({ name, idPrefix, legend, value, onChange, options, columns = 3, error, describedBy, hideLegend }) {
  return (
    <fieldset aria-describedby={describedBy} aria-invalid={error ? true : undefined} className="min-w-0">
      <legend className={hideLegend ? 'sr-only' : 'text-[13px] font-semibold text-black/85 mb-1.5'}>{legend}</legend>
      <div className={`grid gap-2 ${columns === 2 ? 'grid-cols-2' : 'grid-cols-3'}`}>
        {options.map((o, i) => {
          const selected = value === o.value
          return (
            <label key={o.value} className="relative block cursor-pointer min-w-0">
              <input
                id={`${idPrefix}-${i}`}
                type="radio"
                name={name}
                value={o.value}
                checked={selected}
                onChange={() => onChange(o.value)}
                className="peer sr-only"
              />
              <span
                className={`flex flex-col justify-center min-h-[56px] rounded-[14px] border-[1.5px] px-3 py-2 pr-7 transition peer-focus-visible:outline peer-focus-visible:outline-2 peer-focus-visible:outline-offset-2 peer-focus-visible:outline-[#0A13E6] ${
                  selected ? 'border-black bg-[#0A13E6] text-white shadow-sm' : error ? 'border-red-400 bg-white text-black' : 'border-black/15 bg-white text-black hover:border-black/40'
                }`}
              >
                <span className="text-[13px] font-bold leading-tight break-words">{o.label}</span>
                {o.hint && <span className={`text-[11px] font-medium leading-tight mt-0.5 break-words ${selected ? 'text-white/80' : 'text-black/50'}`}>{o.hint}</span>}
                {selected && <Check size={14} aria-hidden="true" className="absolute right-2.5 top-2.5" />}
              </span>
            </label>
          )
        })}
      </div>
    </fieldset>
  )
})

export function Switch({ id, checked, onChange, label, hint }) {
  return (
    <div className="flex items-start gap-3">
      <button
        id={id}
        type="button"
        role="switch"
        aria-checked={checked}
        aria-labelledby={`${id}-label`}
        aria-describedby={hint ? `${id}-hint` : undefined}
        onClick={() => onChange(!checked)}
        className={`relative shrink-0 mt-0.5 h-7 w-12 rounded-full border-[1.5px] border-black transition ${checked ? 'bg-[#0A13E6]' : 'bg-[#F5F3EF]'}`}
      >
        <span className={`absolute top-0.5 left-0.5 h-5 w-5 rounded-full border-[1.5px] border-black bg-white transition-transform ${checked ? 'translate-x-5' : ''}`} />
        <span className="sr-only">{checked ? 'On' : 'Off'}</span>
      </button>
      <div className="min-w-0">
        <p id={`${id}-label`} className="text-[13px] font-semibold text-black/85">
          {label} <span className="text-black/50 font-medium">· {checked ? 'On' : 'Off'}</span>
        </p>
        {hint && (
          <p id={`${id}-hint`} className="text-[11.5px] text-black/50 font-medium mt-0.5">
            {hint}
          </p>
        )}
      </div>
    </div>
  )
}

// Money field. State holds plain digits ("25000"); the box shows grouped
// digits with a currency prefix ("25,000"). Typing, pasting and deleting keep
// the caret next to the same digit, letters/symbols/decimals are dropped, and
// a negative amount is refused with a message instead of being silently
// turned positive.
export const MoneyInput = memo(function MoneyInput({ id, value, onChange, symbol, error, describedBy, placeholder = '0', invalid }) {
  const ref = useRef(null)
  const caretDigits = useRef(null)
  // Set when a "." is typed: whole amounts only, so the digits that follow it
  // are ignored instead of being glued onto the whole part (25000.50 must not
  // turn into 2,500,050).
  const inFraction = useRef(false)
  const [hint, setHint] = useState('')
  const shown = groupDigits(value)

  useLayoutEffect(() => {
    if (caretDigits.current == null || !ref.current || document.activeElement !== ref.current) return
    const pos = caretForDigitCount(shown, caretDigits.current)
    ref.current.setSelectionRange(pos, pos)
    caretDigits.current = null
  })

  function handleChange(e) {
    const raw = e.target.value
    const inputType = e.nativeEvent?.inputType || ''
    const typed = e.nativeEvent?.data || ''
    if (inputType === 'insertText' && typed === '.') {
      inFraction.current = true
      setHint('Whole amounts only. Decimals are ignored.')
      return
    }
    if (inFraction.current && inputType === 'insertText' && /^\d$/.test(typed)) return
    if (inputType.startsWith('delete') || inputType === 'insertFromPaste') inFraction.current = false
    if (hasNegativeSign(raw)) {
      setHint("Prices can't be negative.")
      caretDigits.current = null
      return
    }
    setHint('')
    const caret = e.target.selectionStart ?? raw.length
    const digitsBefore = raw.slice(0, caret).replace(/\D/g, '').length
    const next = sanitizeMoneyInput(raw)
    caretDigits.current = Math.min(digitsBefore, next.length)
    if (next === value) {
      // Nothing changed (e.g. a letter was typed) — the controlled input
      // snaps back, so put the caret where it was.
      requestAnimationFrame(() => {
        if (ref.current && document.activeElement === ref.current) {
          const pos = caretForDigitCount(shown, caretDigits.current ?? 0)
          ref.current.setSelectionRange(pos, pos)
        }
      })
    }
    onChange(next)
  }

  return (
    <div>
      <div className="relative">
        <span aria-hidden="true" className="absolute left-4 top-1/2 -translate-y-1/2 text-[15px] font-bold text-black/60 pointer-events-none">
          {symbol}
        </span>
        <input
          ref={ref}
          id={id}
          type="text"
          inputMode="numeric"
          autoComplete="off"
          value={shown}
          onChange={handleChange}
          onBlur={() => {
            inFraction.current = false
            setHint('')
          }}
          placeholder={placeholder}
          aria-describedby={[describedBy, hint ? `${id}-neg` : ''].filter(Boolean).join(' ') || undefined}
          aria-invalid={invalid || error ? true : undefined}
          className={`${inputClass(invalid || error)} tabular-nums`}
          style={{ paddingLeft: `${Math.max(2.25, 1.25 + symbol.length * 0.75)}rem` }}
        />
      </div>
      {hint && (
        <p id={`${id}-neg`} role="status" className="text-[12px] text-red-600 font-semibold mt-1.5">
          {hint}
        </p>
      )}
    </div>
  )
})
