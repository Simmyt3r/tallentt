// Path: src/components/hatform/useHatMedia.js
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { ALLOWED_UPLOAD_PREFIXES, MAX_UPLOAD_BYTES, uploadToCloudinary } from '../../lib/api'
import { compressImageFile } from '../../lib/media'
import { describeUploadError, mediaSignature } from '../../lib/hatForm'

const CONCURRENCY = 2
const PROGRESS_STEP = 0.05 // don't re-render the whole form on every progress event

export function mediaKind(typeOrMime) {
  const t = String(typeOrMime || '')
  if (t.startsWith('video')) return 'video'
  if (t.startsWith('audio')) return 'audio'
  return 'image'
}

export const KIND_LABEL = { image: 'Photo', video: 'Video', audio: 'Audio clip' }

const fileSignature = (f) => `${f.name}:${f.size}:${f.lastModified}`

function fromExisting(m, i) {
  const tail = String(m.public_id || '').split('/').pop()
  return {
    key: `e-${m.id || m.public_id || i}`,
    status: 'ready',
    origin: 'existing',
    url: m.url,
    public_id: m.public_id,
    type: m.type || 'image',
    kind: mediaKind(m.type),
    caption: m.caption || null,
    name: tail || '',
    progress: 1,
    error: '',
    previewUrl: '',
  }
}

/**
 * State + upload pipeline for the Hat media list.
 *
 * `type` is what the API stores (Cloudinary reports audio as 'video'); `kind` is only
 * used for display so an audio clip still reads as audio.
 *
 * Item statuses: 'ready' (saved or uploaded) | 'queued' | 'uploading' | 'failed'.
 * Only 'ready' items are ever sent to the API; queued/uploading/failed items
 * block Publish until the person waits, retries or removes them, so nothing
 * is silently dropped.
 */
export function useHatMedia() {
  const [items, setItems] = useState([])
  const [rejected, setRejected] = useState([]) // [{ id, name, reason }]
  const [announcement, setAnnouncement] = useState('')

  const seq = useRef(0)
  const files = useRef(new Map()) // key -> original File (kept for retry)
  const payloads = useRef(new Map()) // key -> File actually uploaded (compressed once)
  const controllers = useRef(new Map()) // key -> AbortController
  const queue = useRef([]) // keys waiting for a slot
  const active = useRef(0)
  const signatures = useRef(new Map()) // key -> file signature (dedupe)
  const objectUrls = useRef(new Map()) // key -> blob: URL
  const mounted = useRef(false)
  const lastProgress = useRef(new Map())

  const patch = useCallback((key, changes) => {
    setItems((list) => list.map((it) => (it.key === key ? { ...it, ...changes } : it)))
  }, [])

  const revokeUrl = useCallback((key) => {
    const url = objectUrls.current.get(key)
    if (url) {
      URL.revokeObjectURL(url)
      objectUrls.current.delete(key)
    }
  }, [])

  const forget = useCallback(
    (key) => {
      files.current.delete(key)
      payloads.current.delete(key)
      signatures.current.delete(key)
      lastProgress.current.delete(key)
      controllers.current.get(key)?.abort()
      controllers.current.delete(key)
      queue.current = queue.current.filter((k) => k !== key)
      revokeUrl(key)
    },
    [revokeUrl],
  )

  const pump = useCallback(() => {
    // eslint-disable-next-line no-use-before-define
    while (mounted.current && active.current < CONCURRENCY && queue.current.length) runUpload(queue.current.shift())
  }, []) // runUpload is stable (declared below with useCallback and no deps that change)

  const runUpload = useCallback(
    async (key) => {
      const original = files.current.get(key)
      if (!original) return
      const controller = new AbortController()
      controllers.current.set(key, controller)
      active.current += 1
      patch(key, { status: 'uploading', progress: 0, error: '' })
      try {
        let toUpload = payloads.current.get(key)
        if (!toUpload) {
          toUpload = await compressImageFile(original)
          payloads.current.set(key, toUpload)
        }
        if (controller.signal.aborted) throw Object.assign(new Error('cancelled'), { name: 'AbortError' })
        const uploaded = await uploadToCloudinary(toUpload, {
          signal: controller.signal,
          onProgress: (p) => {
            const last = lastProgress.current.get(key) ?? -1
            if (p - last >= PROGRESS_STEP || p >= 1) {
              lastProgress.current.set(key, p)
              patch(key, { progress: p })
            }
          },
        })
        if (!mounted.current) return
        // The blob preview is no longer needed once Cloudinary has the file.
        revokeUrl(key)
        files.current.delete(key)
        payloads.current.delete(key)
        patch(key, { status: 'ready', progress: 1, previewUrl: '', ...uploaded, caption: null })
        setAnnouncement(`${original.name} uploaded.`)
      } catch (err) {
        if (err?.name === 'AbortError' || !mounted.current) return
        const reason = describeUploadError(err)
        patch(key, { status: 'failed', error: reason })
        setAnnouncement(`${original.name} failed to upload. ${reason}`)
      } finally {
        controllers.current.delete(key)
        active.current = Math.max(0, active.current - 1)
        pump()
      }
    },
    [patch, pump, revokeUrl],
  )

  useEffect(() => {
    mounted.current = true
    const urls = objectUrls.current
    const ctrls = controllers.current
    return () => {
      mounted.current = false
      ctrls.forEach((c) => c.abort())
      urls.forEach((u) => URL.revokeObjectURL(u))
      urls.clear()
    }
  }, [])

  /** Replace the list with an existing hat's media (Edit). */
  const reset = useCallback(
    (existing = []) => {
      items.forEach((it) => forget(it.key))
      setItems(existing.filter((m) => m && m.url && m.public_id).map(fromExisting))
      setRejected([])
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [forget],
  )

  const addFiles = useCallback(
    (fileList) => {
      const incoming = Array.from(fileList || [])
      if (!incoming.length) return
      const newItems = []
      const newRejected = []
      const seen = new Set(signatures.current.values())

      for (const file of incoming) {
        const sig = fileSignature(file)
        const kind = mediaKind(file.type)
        if (!ALLOWED_UPLOAD_PREFIXES.some((p) => file.type?.startsWith(p))) {
          newRejected.push({ id: `${sig}:type`, name: file.name, reason: 'Unsupported format. Use an image, video or audio file.' })
          continue
        }
        // Images are shrunk in the browser before upload, so only enforce the
        // 20MB ceiling up front for files that go up as-is.
        if (kind !== 'image' && file.size > MAX_UPLOAD_BYTES) {
          newRejected.push({ id: `${sig}:size`, name: file.name, reason: 'Too large. Files can be up to 20MB.' })
          continue
        }
        if (seen.has(sig)) {
          newRejected.push({ id: `${sig}:dup`, name: file.name, reason: 'Already added.' })
          continue
        }
        seen.add(sig)
        seq.current += 1
        const key = `n-${seq.current}`
        files.current.set(key, file)
        signatures.current.set(key, sig)
        let previewUrl = ''
        if (kind !== 'audio') {
          previewUrl = URL.createObjectURL(file)
          objectUrls.current.set(key, previewUrl)
        }
        newItems.push({
          key,
          status: 'queued',
          origin: 'new',
          url: '',
          public_id: '',
          type: kind,
          kind,
          caption: null,
          name: file.name,
          progress: 0,
          error: '',
          previewUrl,
        })
      }

      if (newRejected.length) setRejected((r) => [...r, ...newRejected])
      if (!newItems.length) return
      setItems((list) => [...list, ...newItems])
      queue.current.push(...newItems.map((n) => n.key))
      pump()
    },
    [pump],
  )

  const retry = useCallback(
    (key) => {
      if (!files.current.has(key)) return
      patch(key, { status: 'queued', progress: 0, error: '' })
      lastProgress.current.delete(key)
      queue.current.push(key)
      pump()
    },
    [patch, pump],
  )

  const remove = useCallback(
    (key) => {
      forget(key)
      setItems((list) => list.filter((it) => it.key !== key))
    },
    [forget],
  )

  const move = useCallback((key, delta) => {
    setItems((list) => {
      const from = list.findIndex((it) => it.key === key)
      const to = from + delta
      if (from < 0 || to < 0 || to >= list.length) return list
      const next = list.slice()
      const [it] = next.splice(from, 1)
      next.splice(to, 0, it)
      return next
    })
  }, [])

  const makeCover = useCallback((key) => {
    setItems((list) => {
      const from = list.findIndex((it) => it.key === key)
      if (from <= 0) return list
      const next = list.slice()
      const [it] = next.splice(from, 1)
      next.unshift(it)
      return next
    })
  }, [])

  const dismissRejected = useCallback((id) => {
    setRejected((r) => (id ? r.filter((x) => x.id !== id) : []))
  }, [])

  const stats = useMemo(() => {
    let ready = 0
    let uploading = 0
    let failed = 0
    for (const it of items) {
      if (it.status === 'ready') ready += 1
      else if (it.status === 'failed') failed += 1
      else uploading += 1
    }
    return { ready, uploading, failed }
  }, [items])

  // Ordered list the API should store (index 0 = cover).
  const readyMedia = useMemo(
    () => items.filter((it) => it.status === 'ready').map((it) => ({ url: it.url, public_id: it.public_id, type: it.type, caption: it.caption || null })),
    [items],
  )

  const signature = useMemo(() => mediaSignature(readyMedia.map((m) => m.public_id), stats.uploading + stats.failed), [readyMedia, stats])

  return { items, stats, readyMedia, signature, rejected, announcement, addFiles, retry, remove, move, makeCover, dismissRejected, reset }
}
