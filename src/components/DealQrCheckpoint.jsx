import { useEffect, useRef, useState } from 'react'
import { Camera, RefreshCw } from 'lucide-react'
import { api } from '../lib/api.js'

const money = (amount) => new Intl.NumberFormat('en-NG', {
  style: 'currency', currency: 'NGN', maximumFractionDigits: 0,
}).format(amount)

export default function DealQrCheckpoint({ booking, role, onComplete }) {
  const stage = booking.work_status === 'awaiting_start' ? 'start' : 'completion'
  const [issued, setIssued] = useState(null)
  const [image, setImage] = useState('')
  const [input, setInput] = useState('')
  const [scanning, setScanning] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [now, setNow] = useState(Date.now())
  const video = useRef(null)
  const camera = useRef(null)
  const scanInFlight = useRef(false)

  useEffect(() => {
    setIssued(null); setImage(''); setInput(''); setError(''); setScanning(false)
  }, [booking.id, stage])

  useEffect(() => {
    if (!issued) return undefined
    const timer = setInterval(() => setNow(Date.now()), 1000)
    return () => clearInterval(timer)
  }, [issued])

  async function generate() {
    setBusy(true); setError(''); setIssued(null); setImage('')
    try {
      const next = await api.generateBookingQr(booking.id, stage)
      const { default: QRCode } = await import('qrcode')
      const src = await QRCode.toDataURL(next.token, { width: 256, margin: 2, errorCorrectionLevel: 'M' })
      setIssued(next); setImage(src); setNow(Date.now())
    } catch (err) { setError(err.message || 'Could not generate the QR code.') }
    finally { setBusy(false) }
  }

  async function redeem(token) {
    setBusy(true); setError('')
    try {
      const result = await api.redeemBookingQr(booking.id, token.trim())
      setInput('')
      try { await onComplete(result) }
      catch { setError('Payment was recorded, but the screen could not refresh. Reload My Deals to see the latest status.') }
    } catch (err) { setError(err.message || 'Could not verify the QR code.') }
    finally { setBusy(false); scanInFlight.current = false }
  }

  useEffect(() => {
    if (!scanning || !video.current) return undefined
    let stopped = false
    import('@zxing/browser').then(async ({ BrowserQRCodeReader }) => {
      if (stopped) return
      const reader = new BrowserQRCodeReader()
      const controls = await reader.decodeFromVideoDevice(undefined, video.current, (result, _error, activeControls) => {
        if (!result || scanInFlight.current) return
        scanInFlight.current = true
        activeControls.stop()
        setScanning(false)
        redeem(result.getText())
      })
      if (stopped) controls.stop()
      else camera.current = controls
    }).catch((err) => {
      if (!stopped) { setScanning(false); setError(err.message || 'Camera unavailable. Enter the code manually.') }
    })
    return () => {
      stopped = true
      camera.current?.stop()
      camera.current = null
    }
  }, [scanning, booking.id, stage])

  const expired = issued && new Date(issued.expiresAt).getTime() <= now
  const amount = stage === 'start'
    ? Math.floor(Number(booking.amount) * 3 / 10)
    : Number(booking.amount) - Number(booking.start_released_amount || 0)

  return <div className="border-t border-black/10 px-4 sm:px-5 py-3 space-y-3 bg-[#F7F3EB]/50">
    <p className="text-[12px] font-bold">{stage === 'start' ? 'Start work · 30% payment' : 'Complete work · remaining payment'}</p>
    <p className="text-[11px] text-black/60">
      {role === 'client'
        ? stage === 'start'
          ? `Present this code to the talent when work begins. Scanning releases ${money(amount)} from funded escrow.`
          : `Delivery is approved. Present this code to the talent to release the remaining ${money(amount)}.`
        : stage === 'start'
          ? `Scan the client's start QR when work begins to receive ${money(amount)} in your wallet.`
          : `Scan the client's completion QR to receive the remaining ${money(amount)} in your wallet.`}
    </p>
    {error && <p role="alert" className="text-[11px] font-semibold text-red-700">{error}</p>}
    {role === 'client' ? <>
      <button type="button" disabled={busy} onClick={generate}
        className="h-9 px-4 rounded-full bg-[#0A13E6] text-white border-[1.5px] border-black text-[11px] font-black disabled:opacity-50 inline-flex items-center gap-2">
        {issued ? <RefreshCw size={14} /> : null}{busy ? 'Generating…' : issued ? 'Generate new QR' : `Generate ${stage} QR`}
      </button>
      {issued && !expired && image && <div className="flex flex-col items-start gap-2">
        <img src={image} width="256" height="256" alt={`${stage} checkpoint QR for this booking`} className="rounded-lg border border-black/15" />
        <p className="text-[11px] text-black/60">Expires {new Date(issued.expiresAt).toLocaleTimeString()}. A new code replaces this one.</p>
        <label className="text-[11px] font-semibold w-full max-w-xs">Manual code (if the talent cannot scan)
          <input readOnly value={issued.token} onFocus={(event) => event.target.select()}
            className="block mt-1 w-full rounded-lg border border-black/20 p-2 font-mono text-[10px]" />
        </label>
      </div>}
      {expired && <p className="text-[11px] text-amber-700">Code expired. Generate another QR before the talent scans.</p>}
    </> : <>
      <button type="button" disabled={busy} onClick={() => setScanning((current) => !current)}
        className="h-9 px-4 rounded-full bg-[#0A13E6] text-white border-[1.5px] border-black text-[11px] font-black disabled:opacity-50 inline-flex items-center gap-2">
        <Camera size={14} />{scanning ? 'Stop camera' : `Scan ${stage} QR`}
      </button>
      {scanning && <video ref={video} muted playsInline autoPlay aria-label="QR scanner camera preview"
        className="w-full max-w-[320px] aspect-square object-cover rounded-xl border border-black/15" />}
      <form onSubmit={(event) => { event.preventDefault(); redeem(input) }} className="flex flex-wrap gap-2 items-end">
        <label className="text-[11px] font-semibold flex-1 min-w-[180px]">Or enter the code shown by the client
          <input value={input} onChange={(event) => setInput(event.target.value)} autoComplete="off"
            placeholder="Paste the client's QR code" className="block mt-1 w-full h-9 rounded-lg border border-black/20 px-3 text-[11px]" />
        </label>
        <button type="submit" disabled={busy || !input.trim()}
          className="h-9 px-4 rounded-full border-[1.5px] border-black text-[11px] font-black disabled:opacity-50">
          {busy ? 'Verifying…' : 'Confirm code'}
        </button>
      </form>
    </>}
  </div>
}
