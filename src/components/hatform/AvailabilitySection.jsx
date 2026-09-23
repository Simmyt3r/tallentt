// Path: src/components/hatform/AvailabilitySection.jsx
import { memo } from 'react'
import { WEEKDAYS } from '../../lib/hatForm'
import { Field, Section, inputClass } from './formParts'

const QUICK_DAYS = [
  { label: 'Weekdays', days: ['mon', 'tue', 'wed', 'thu', 'fri'] },
  { label: 'Every day', days: WEEKDAYS.map((day) => day.value) },
  { label: 'Weekends', days: ['sat', 'sun'] },
]

function sameDays(a, b) {
  return a.length === b.length && a.every((day, index) => day === b[index])
}

function AvailabilitySection({ copy, available, availableDays, flexibleHours, availableFrom, availableTo, errors, onChange }) {
  const selected = Array.isArray(availableDays) ? availableDays : []

  function toggleDay(day) {
    const next = selected.includes(day)
      ? selected.filter((value) => value !== day)
      : WEEKDAYS.map((item) => item.value).filter((value) => value === day || selected.includes(value))
    onChange('availableDays', next)
  }

  return (
    <Section id="hat-section-availability" title="Schedule" description={copy.whenQuestion}>
      <div className="space-y-2">
        <div className="flex items-center justify-between gap-3">
          <p className="text-[12px] font-bold text-black/70">Days</p>
          {errors.availableDays && <p className="text-[11px] font-semibold text-red-600">{errors.availableDays}</p>}
        </div>

        <div className="flex flex-wrap gap-1.5" aria-label="Quick day selection">
          {QUICK_DAYS.map((choice) => (
            <button
              key={choice.label}
              type="button"
              onClick={() => onChange('availableDays', choice.days)}
              className={`h-8 px-3 rounded-full border text-[11px] font-semibold transition ${
                sameDays(selected, choice.days) ? 'bg-black text-white border-black' : 'bg-white border-black/15 hover:border-black/40'
              }`}
            >
              {choice.label}
            </button>
          ))}
        </div>

        <div className="grid grid-cols-4 sm:grid-cols-7 gap-1.5" role="group" aria-label="Available days">
          {WEEKDAYS.map((day) => {
            const active = selected.includes(day.value)
            return (
              <button
                key={day.value}
                id={`hat-available-day-${day.value}`}
                type="button"
                aria-pressed={active}
                onClick={() => toggleDay(day.value)}
                className={`min-h-[42px] rounded-[12px] border-[1.5px] text-[12px] font-bold transition ${
                  active
                    ? 'bg-[#0A13E6] text-white border-black'
                    : 'bg-white text-black/55 border-black/15 hover:border-black/40'
                }`}
              >
                {day.short}
              </button>
            )
          })}
        </div>
      </div>

      <label className="flex items-center gap-3 min-h-[44px] cursor-pointer select-none text-[13px] font-semibold">
        <input
          id="hat-flexible-hours"
          type="checkbox"
          checked={flexibleHours}
          onChange={(e) => onChange('flexibleHours', e.target.checked)}
          className="h-5 w-5 rounded border-black accent-[#0A13E6]"
        />
        Flexible hours
      </label>

      {!flexibleHours && (
        <div className="space-y-2">
          <div className="grid grid-cols-2 gap-3">
            <Field id="hat-available-from" label="From" error={errors.availableFrom}>
              {(a11y) => <input {...a11y} type="time" className={`${inputClass(errors.availableFrom)} min-w-0`} value={availableFrom} onChange={(e) => onChange('availableFrom', e.target.value)} />}
            </Field>
            <Field id="hat-available-to" label="To" error={errors.availableTo}>
              {(a11y) => <input {...a11y} type="time" className={`${inputClass(errors.availableTo)} min-w-0`} value={availableTo} onChange={(e) => onChange('availableTo', e.target.value)} />}
            </Field>
          </div>
        </div>
      )}

      <p className="text-[11.5px] font-medium text-black/50">{copy.whenHint}</p>
    </Section>
  )
}

export default memo(AvailabilitySection)
