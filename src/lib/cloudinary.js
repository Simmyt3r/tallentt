// Every media URL in this app comes back from uploadToCloudinary() (see
// src/lib/api.js) as a plain, untransformed delivery URL —
//   https://res.cloudinary.com/<cloud>/<image|video>/upload/v.../<public_id>.<ext>
// — and every <img>/<video> in the app was rendering that URL as-is. That
// means a 12MP phone photo or a multi-minute 1080p/4K video was being
// shipped at full original size to every viewer, in every context,
// including 48px grid tiles and 118px "more videos" thumbnails.
//
// Cloudinary transforms on request (inserting a segment right after
// `/upload/`) and caches the derived asset at its own edge, so applying a
// transform here doesn't require re-uploading anything or touching the
// database — it's safe to wrap any existing stored URL, anywhere it's
// rendered, and it degrades to returning the URL unchanged if it isn't
// actually a Cloudinary delivery URL (e.g. a placeholder/seed value).

function withTransform(url, transform) {
  if (!url || typeof url !== 'string' || !transform) return url
  const match = url.match(/\/(image|video)\/upload\//)
  if (!match) return url
  const at = match.index + match[0].length
  return url.slice(0, at) + transform + '/' + url.slice(at)
}

// A right-sized, auto-format/auto-quality image — f_auto picks WebP/AVIF
// where the browser supports it, q_auto picks the smallest quality that
// still looks good, and w/h + c_fill,g_auto crop it to the box it's
// actually rendered in (with content-aware gravity) so a photo never
// ships more pixels than the screen can show. Pass the size it's
// *displayed* at — callers should size up ~2x for retina, not send the
// original dimensions.
export function cldImage(url, { w, h, crop = 'fill' } = {}) {
  if (!url) return url
  const parts = ['f_auto', 'q_auto']
  if (w) parts.push(`w_${w}`)
  if (h) parts.push(`h_${h}`)
  if (w || h) {
    parts.push(`c_${crop}`)
    // Gravity only means something for crop modes that actually crop —
    // 'limit' (used by object-contain viewers, capping size without
    // touching aspect ratio) has nothing to be "gravity-aware" about.
    if (crop === 'fill' || crop === 'thumb' || crop === 'crop') parts.push('g_auto')
  }
  return withTransform(url, parts.join(','))
}

// A still JPG frame pulled from a *video* URL — for every place a video
// is only ever shown as a static thumbnail (grid tiles, rails, thumbnail
// strips) rather than actually played. This ships zero video bytes:
// Cloudinary generates the frame from its stored copy and returns a
// plain image. (Swapping the extension to .jpg on an otherwise-unchanged
// /video/upload/ URL is the documented way to ask Cloudinary for a video
// thumbnail — the resource stays "video", only the delivered format
// changes.)
export function cldVideoPoster(url, { w, h, crop = 'fill' } = {}) {
  if (!url || typeof url !== 'string' || !/\/video\/upload\//.test(url)) return url
  const parts = ['so_0', 'q_auto']
  if (w) parts.push(`w_${w}`)
  if (h) parts.push(`h_${h}`)
  if (w || h) {
    parts.push(`c_${crop}`)
    if (crop === 'fill' || crop === 'thumb' || crop === 'crop') parts.push('g_auto')
  }
  return withTransform(url, parts.join(',')).replace(/\.\w+(\?.*)?$/, '.jpg$1')
}

// Capped, re-encoded video for actual playback — f_auto lets Cloudinary
// pick an efficient codec/container per browser, q_auto picks a
// bitrate-aware quality, and w + c_limit cap the resolution so a 4K
// source is never streamed pixel-for-pixel into a 480px-wide reel slide
// or a phone screen. Never upscales anything smaller than `w`.
export function cldVideo(url, { w } = {}) {
  if (!url) return url
  const parts = ['f_auto', 'q_auto']
  if (w) parts.push(`w_${w}`, 'c_limit')
  return withTransform(url, parts.join(','))
}