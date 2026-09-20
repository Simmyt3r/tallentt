// Path: src/components/hatform/AvailabilitySection.jsx
import { memo } from 'react'
import { Field, Section, Switch, inputClass } from './formParts'

// The Hat model stores an on/off availability flag plus an optional DAILY
// time window (available_from / available_to). There is no calendar-date
// range in the model, so this section edits exactly those two things.
function AvailabilitySection({ copy, available, flexibleHours, availableFrom, availableTo, errors, onChange }) {
  return (
    <Section id="hat-section-availability" title="Availability" description={copy.whenQuestion}>
      <Switch id="hat-available" checked={available} onChange={(v) => onChange('available', v)} label={copy.openSwitch} hint={copy.openSwitchHint} />

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
          <p className="text-[11.5px] font-medium text-black/50">{copy.whenHint} Shown on your Hat as a daily window.</p>
        </div>
      )}
    </Section>
  )
}

export default memo(AvailabilitySection)
