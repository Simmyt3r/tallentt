// Client/server single source of truth for permitted Hat media types.
// "audio" uses Cloudinary's "video" resource type.
export const HAT_MEDIA_MIME_TYPES = Object.freeze([
  'image/jpeg', 'image/png', 'image/webp', 'image/gif', 'image/avif',
  'video/mp4', 'video/webm', 'video/quicktime',
  'audio/mpeg', 'audio/mp3', 'audio/wav', 'audio/x-wav',
  'audio/ogg', 'audio/mp4',
])
export const MAX_HAT_MEDIA_BYTES = 20 * 1024 * 1024
export function supportedHatMediaMime(mime) {
  return typeof mime === 'string' && HAT_MEDIA_MIME_TYPES.includes(mime.toLowerCase().trim())
}
