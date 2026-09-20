// Path: src/components/hatform/LocationSection.jsx
import { memo } from 'react'
import { COUNTRIES, DELIVERY_OPTIONS } from '../../lib/hatForm'
import { Field, RadioCards, SelectBox, Section, inputClass } from './formParts'

function LocationSection({ countryName, currency, city, deliveryMode, errors, onChange }) {
  const onSite = deliveryMode === 'Physical'
  const cityHint =
    deliveryMode === 'Hybrid'
      ? 'Where would on-site work happen? A city or area is enough.'
      : onSite
        ? 'The city or area where the work happens. No street address needed.'
        : 'Where you are based. A city or area is enough.'

  return (
    <Section id="hat-section-location" title="Location & delivery">
      <RadioCards
        name="hat-delivery"
        idPrefix="hat-delivery"
        legend="How will this work?"
        value={deliveryMode}
        onChange={(v) => onChange('deliveryMode', v)}
        options={DELIVERY_OPTIONS}
        error={errors.deliveryMode}
        describedBy={errors.deliveryMode ? 'hat-delivery-error' : undefined}
      />
      {errors.deliveryMode && (
        <p id="hat-delivery-error" className="text-[12px] text-red-600 font-semibold -mt-2">
          {errors.deliveryMode}
        </p>
      )}

      <div className="grid gap-4 sm:grid-cols-2">
        <Field id="hat-country" label="Country" hint={`Sets your currency (${currency}).`}>
          {(a11y) => (
            <SelectBox {...a11y} value={countryName} onChange={(e) => onChange('countryName', e.target.value)}>
              {COUNTRIES.map((c) => (
                <option key={c.name} value={c.name}>
                  {c.flag} {c.name}
                </option>
              ))}
            </SelectBox>
          )}
        </Field>
        <Field id="hat-city" label="City or area" optional={!onSite} hint={cityHint} error={errors.city}>
          {(a11y) => (
            <input {...a11y} type="text" className={inputClass(errors.city)} value={city} placeholder="e.g. Wuse 2, Abuja" autoComplete="address-level2" onChange={(e) => onChange('city', e.target.value)} />
          )}
        </Field>
      </div>
    </Section>
  )
}

export default memo(LocationSection)
