// Path: src/components/hatform/PricingSection.jsx
import { memo } from 'react'
import { CUSTOM_UNIT_MAX, PRICE_MODES, RATE_UNITS } from '../../lib/hatForm'
import { Field, MoneyInput, RadioCards, SelectBox, Section, inputClass } from './formParts'

function PricingSection({
  copy,
  symbol,
  priceMode,
  amount,
  priceMin,
  priceMax,
  rateUnit,
  rateUnitCustom,
  errors,
  onChange,
}) {
  const priceOptions = PRICE_MODES.map(({ value, label }) => ({ value, label }))

  return (
    <Section id="hat-section-pricing" title="Pricing">
      <RadioCards
        name="hat-price-mode"
        idPrefix="hat-price-mode"
        legend="Price type"
        value={priceMode}
        onChange={(v) => onChange('priceMode', v)}
        options={priceOptions}
        columns={2}
      />

      {priceMode === 'range' ? (
        <div className="grid gap-3 sm:grid-cols-2">
          <Field id="hat-price-min" label={`From (${copy.minLabel})`} error={errors.priceMin}>
            {(a11y) => (
              <MoneyInput
                id={a11y.id}
                value={priceMin}
                onChange={(v) => onChange('priceMin', v)}
                symbol={symbol}
                error={errors.priceMin}
                describedBy={a11y['aria-describedby']}
                placeholder="25,000"
              />
            )}
          </Field>
          <Field id="hat-price-max" label={`To (${copy.maxLabel})`} error={errors.priceMax}>
            {(a11y) => (
              <MoneyInput
                id={a11y.id}
                value={priceMax}
                onChange={(v) => onChange('priceMax', v)}
                symbol={symbol}
                error={errors.priceMax}
                describedBy={a11y['aria-describedby']}
                placeholder="50,000"
              />
            )}
          </Field>
        </div>
      ) : (
        <Field id="hat-amount" label={copy.fixedLabel} error={errors.amount}>
          {(a11y) => (
            <MoneyInput
              id={a11y.id}
              value={amount}
              onChange={(v) => onChange('amount', v)}
              symbol={symbol}
              error={errors.amount}
              describedBy={a11y['aria-describedby']}
              placeholder="25,000"
            />
          )}
        </Field>
      )}

      <Field id="hat-rate-unit" label="Pay unit">
        {(a11y) => (
          <SelectBox {...a11y} value={rateUnit} onChange={(e) => onChange('rateUnit', e.target.value)}>
            {RATE_UNITS.map((u) => (
              <option key={u.value} value={u.value}>
                {u.label}
              </option>
            ))}
          </SelectBox>
        )}
      </Field>

      {rateUnit === 'custom' && (
        <Field id="hat-rate-unit-custom" label="Custom unit" error={errors.rateUnitCustom}>
          {(a11y) => (
            <input
              {...a11y}
              type="text"
              className={inputClass(errors.rateUnitCustom)}
              value={rateUnitCustom}
              maxLength={CUSTOM_UNIT_MAX + 10}
              placeholder="e.g. per event"
              onChange={(e) => onChange('rateUnitCustom', e.target.value)}
            />
          )}
        </Field>
      )}
    </Section>
  )
}

export default memo(PricingSection)
