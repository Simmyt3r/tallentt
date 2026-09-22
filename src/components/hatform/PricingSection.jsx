// Path: src/components/hatform/PricingSection.jsx
import { memo } from 'react'
import { CUSTOM_UNIT_MAX, PRICE_MODES, RATE_UNITS } from '../../lib/hatForm'
import { Field, MoneyInput, RadioCards, SelectBox, Section, inputClass } from './formParts'

function PricingSection({ copy, currency, symbol, priceMode, amount, rateUnit, rateUnitCustom, errors, onChange }) {
  const amountLabel = priceMode === 'range' ? copy.startingLabel : copy.fixedLabel

  return (
    <Section id="hat-section-pricing" title="Pricing" description={copy.priceQuestion}>
      <RadioCards
        name="hat-price-mode"
        idPrefix="hat-price-mode"
        legend="Price type"
        value={priceMode}
        onChange={(v) => onChange('priceMode', v)}
        options={PRICE_MODES}
      />

      <div className="space-y-3">
        <div className="grid gap-3 sm:grid-cols-2">
          <Field id="hat-amount" label={amountLabel} error={errors.amount}>
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
          <Field id="hat-rate-unit" label="Per">
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
        </div>

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

        {priceMode === 'range' && <p className="text-[12px] font-medium text-black/60">{copy.rangeNote}</p>}
      </div>

      <p className="text-[11.5px] font-medium text-black/50">
        Amounts are in {currency}. The currency follows the country you choose under Location.
      </p>
    </Section>
  )
}

export default memo(PricingSection)
