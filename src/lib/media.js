// Downscales + re-encodes an image file in the browser before it's sent
// to Cloudinary, so a multi-megabyte camera photo (routinely 12MP+ and
// 4–8MB straight off a modern phone) never leaves the device at full
// size. This is the one lever in the app that actually reduces *upload*
// data and Cloudinary storage — src/lib/cloudinary.js only optimizes
// delivery of whatever's already stored.
//
// Video isn't touched here: reliably transcoding video in the browser
// needs a WASM encoder (e.g. ffmpeg.wasm), which is itself several MB
// and can take longer to run than the upload it's trying to shrink.
// Capping incoming video resolution/bitrate belongs in the Cloudinary
// upload preset instead (Console → Upload presets → Incoming
// transformation) — see README.
//
// Non-image files, SVGs (already tiny + vector, re-encoding would only
// rasterize and bloat them), anything already under `maxBytes`, and
// anything that fails to decode are all returned unchanged — this is a
// best-effort optimization, never a hard requirement for upload to
// proceed.
export async function compressImageFile(
  file,
  { maxDimension = 1920, quality = 0.82, maxBytes = 600_000 } = {},
) {
  if (!file || !file.type?.startsWith('image/') || file.type === 'image/svg+xml') return file
  if (file.size <= maxBytes) return file
  if (typeof createImageBitmap !== 'function') return file

  try {
    const bitmap = await createImageBitmap(file)
    const scale = Math.min(1, maxDimension / Math.max(bitmap.width, bitmap.height))
    // Already small enough in both dimensions and not wildly over the
    // target size (e.g. a dense-but-small PNG) — not worth re-encoding.
    if (scale === 1 && file.size <= maxBytes * 2) {
      bitmap.close?.()
      return file
    }

    const w = Math.max(1, Math.round(bitmap.width * scale))
    const h = Math.max(1, Math.round(bitmap.height * scale))
    const canvas = document.createElement('canvas')
    canvas.width = w
    canvas.height = h
    const ctx = canvas.getContext('2d')
    ctx.drawImage(bitmap, 0, 0, w, h)
    bitmap.close?.()

    const blob = await new Promise((resolve) => canvas.toBlob(resolve, 'image/jpeg', quality))
    if (!blob || blob.size >= file.size) return file // re-encode didn't actually help — keep the original

    const name = file.name.replace(/\.\w+$/, '') + '.jpg'
    return new File([blob], name, { type: 'image/jpeg', lastModified: Date.now() })
  } catch {
    // Decode failure, unsupported format, very old browser — fall back
    // to the original file rather than blocking the upload.
    return file
  }
}