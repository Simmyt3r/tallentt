// Path: src/components/hatform/AvailabilityStatusSection.jsx
import { memo } from 'react'
import { Section, Switch } from './formParts'

function AvailabilityStatusSection({ copy, available, onChange }) {
  return (
    <Section id="hat-section-availability-status" title="Availability">
      <Switch
        id="hat-available"
        checked={available}
        onChange={(v) => onChange('available', v)}
        label={copy.openSwitch}
      />
    </Section>
  )
}

export default memo(AvailabilityStatusSection)
