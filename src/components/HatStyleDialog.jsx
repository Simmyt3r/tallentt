import { useEffect, useState } from 'react'
import { Paintbrush, X } from 'lucide-react'
import { api } from '../lib/api.js'
import { HAT_ACCENTS, SHOWROOM_TEMPLATES } from '../lib/hatPresentation.js'

export default function HatStyleDialog({ hat, onClose, onSaved }) {
  const [accent, setAccent] = useState(hat?.bento_accent || 'electric')
  const [template, setTemplate] = useState(hat?.showroom_template || 'minimal')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  useEffect(() => {
    if (!hat) return undefined
    function onKey(event) { if (event.key === 'Escape' && !busy) onClose() }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [hat, busy, onClose])
  if (!hat) return null

  async function save(event) {
    event.preventDefault()
    if (busy) return
    setBusy(true)
    setError('')
    try {
      const result = await api.updateHatStyle(hat.id, accent, template)
      onSaved(result.hat)
    } catch (err) {
      setError(err.message || 'Could not save this style.')
    } finally { setBusy(false) }
  }

  return (
    <div className="fixed inset-0 z-[105] grid place-items-center bg-black/60 p-3"
      onMouseDown={(event) => { if (event.target === event.currentTarget && !busy) onClose() }}>
      <section role="dialog" aria-modal="true" aria-labelledby="hat-style-title"
        className="w-full max-w-[470px] max-h-[90vh] overflow-y-auto rounded-[22px] border-[1.5px] border-black bg-white p-5 shadow-2xl">
        <header className="flex items-center justify-between gap-3">
          <h2 id="hat-style-title" className="flex items-center gap-2 text-[17px] font-black">
            <Paintbrush size={18} /> Customize your Hat
          </h2>
          <button type="button" autoFocus disabled={busy} onClick={onClose} aria-label="Close customization"
            className="grid h-10 w-10 place-items-center rounded-full border border-black/20"><X size={17}/></button>
        </header>
        <p className="mt-2 text-[12px] text-black/55">Choose from safe platform designs. Your price, booking controls and profile stay visible and consistent.</p>
        <form onSubmit={save} className="mt-4 space-y-4">
          <fieldset>
            <legend className="mb-2 text-[12px] font-black">Bento accent</legend>
            <div className="grid grid-cols-2 gap-2">
              {Object.entries(HAT_ACCENTS).map(([key, value]) => (
                <label key={key} className={`flex min-h-11 cursor-pointer items-center gap-2 rounded-[12px] border px-3 py-2 text-[11px] font-semibold ${accent === key ? 'border-black bg-[#F7F3EB]' : 'border-black/15'}`}>
                  <input type="radio" name="hat-accent" value={key} checked={accent === key} onChange={() => setAccent(key)} className="sr-only"/>
                  <span aria-hidden="true" className="h-5 w-5 shrink-0 rounded-full border border-black/15" style={{ backgroundColor: value.color }}/>
                  {value.label}
                  {accent === key ? <span className="ml-auto" aria-hidden="true">✓</span> : null}
                </label>
              ))}
            </div>
          </fieldset>
          <fieldset>
            <legend className="mb-2 text-[12px] font-black">Showroom layout</legend>
            <div className="grid grid-cols-2 gap-2">
              {SHOWROOM_TEMPLATES.map(({ id, label }) => (
                <label key={id} className={`flex min-h-11 cursor-pointer items-center gap-2 rounded-[12px] border px-3 text-[11px] font-bold ${template === id ? 'border-black bg-[#F7F3EB]' : 'border-black/15'}`}>
                  <input type="radio" name="hat-template" value={id} checked={template === id}
                    onChange={() => setTemplate(id)} className="accent-[#0A13E6]"/>
                  {label}
                </label>
              ))}
            </div>
          </fieldset>
          <div className="rounded-[16px] border border-black/10 p-3" style={{ borderTop: `4px solid ${HAT_ACCENTS[accent].color}` }}>
            <p className="text-[9px] font-black uppercase tracking-wide text-black/35">Preview · {template}</p>
            <p className="mt-1 text-[15px] font-bold">{hat.hat_name || hat.hat_title}</p>
            <p className="text-[11px] text-black/55">{hat.hat_title} · {hat.category}</p>
            <p className="mt-2 text-[11px] font-black" style={{ color: HAT_ACCENTS[accent].color }}>Price and booking remain platform-controlled</p>
          </div>
          {error && <p role="alert" className="rounded-[12px] bg-red-50 p-3 text-[12px] font-bold text-red-700">{error}</p>}
          <div className="flex justify-end gap-2">
            <button type="button" disabled={busy} onClick={onClose} className="h-10 rounded-full border border-black px-4 text-[12px] font-bold">Cancel</button>
            <button type="submit" disabled={busy} className="h-10 rounded-full bg-[#0A13E6] px-5 text-[12px] font-bold text-white disabled:opacity-50">{busy ? 'Saving…' : 'Save appearance'}</button>
          </div>
        </form>
      </section>
    </div>
  )
}
