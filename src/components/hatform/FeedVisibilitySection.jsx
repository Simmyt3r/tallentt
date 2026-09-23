import { useState } from 'react'
import Dialog from './Dialog'
import { Section, Switch } from './formParts'

export default function FeedVisibilitySection({ visible, priceMode, onChange, disabled }) {
  const [noticeOpen, setNoticeOpen] = useState(false)

  function toggle(next) {
    if (next && priceMode === 'range') setNoticeOpen(true)
    else onChange({ visible: next, confirmed: false })
  }

  return (
    <Section id="hat-section-feed" title="Visibility">
      <fieldset disabled={disabled} className="disabled:opacity-60">
        <Switch
          id="hat-feed-visible"
          checked={visible}
          onChange={toggle}
          label="Show in Bento feeds"
        />
      </fieldset>
      <Dialog open={noticeOpen} onClose={() => setNoticeOpen(false)} variant="alert" role="alertdialog" labelledBy="hat-create-feed-title" describedBy="hat-create-feed-description">
        <h2 id="hat-create-feed-title" className="text-[18px] font-bold">A negotiation fee applies</h2>
        <p id="hat-create-feed-description" className="text-[13px] text-black/70 mt-2 leading-relaxed">
          This Hat uses Range pricing. A negotiation fee applies when negotiating. Confirm to show this Hat in Bento feeds after you publish it.
        </p>
        <div className="flex flex-wrap justify-end gap-2 mt-5">
          <button type="button" onClick={() => setNoticeOpen(false)} className="tw-btn-ghost h-11 px-4">Cancel</button>
          <button
            type="button"
            onClick={() => {
              onChange({ visible: true, confirmed: true })
              setNoticeOpen(false)
            }}
            className="tw-btn-primary h-11 px-4"
          >
            Confirm and show
          </button>
        </div>
      </Dialog>
    </Section>
  )
}
