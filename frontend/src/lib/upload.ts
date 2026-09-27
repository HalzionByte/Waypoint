/** Photo upload rules, mirroring backend/app/config.py. */

export const MAX_PHOTO_BYTES = 8 * 1024 * 1024

export const ACCEPTED_IMAGE_TYPES = [
  'image/jpeg',
  'image/png',
  'image/webp',
  'image/gif',
] as const

/**
 * Returns a human-readable problem with the file, or null when it is usable.
 * Checking here saves a round trip and gives instant feedback.
 */
export function validatePhoto(file: File): string | null {
  const type = (file.type || '').split(';')[0].trim().toLowerCase()
  if (!ACCEPTED_IMAGE_TYPES.includes(type as (typeof ACCEPTED_IMAGE_TYPES)[number])) {
    return `“${file.name}” is not a supported image. Use JPEG, PNG, WebP, or GIF.`
  }
  if (file.size > MAX_PHOTO_BYTES) {
    const limitMb = Math.round(MAX_PHOTO_BYTES / (1024 * 1024))
    return `“${file.name}” is ${(file.size / (1024 * 1024)).toFixed(1)} MB — the limit is ${limitMb} MB.`
  }
  return null
}
