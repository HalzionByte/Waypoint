import { usePhotoSrc } from '../lib/usePhotoSrc'

interface PhotoProps {
  photoUrl: string | null | undefined
  alt: string
  className?: string
  /** Shown when there is no photo. Pass an empty string to render nothing. */
  placeholder?: string
  placeholderClassName?: string
}

/**
 * A landmark photo, or a placeholder.
 *
 * Use this anywhere a photo is rendered, so no caller has to remember that a
 * saved photo is an IndexedDB reference rather than a URL.
 */
export function LandmarkPhoto({
  photoUrl,
  alt,
  className,
  placeholder = 'No photo for this landmark',
  placeholderClassName = 'photo-placeholder--flat',
}: PhotoProps) {
  const src = usePhotoSrc(photoUrl)

  if (!src) {
    if (!placeholder) return null
    return <div className={`photo-placeholder ${placeholderClassName}`}>{placeholder}</div>
  }
  return <img className={className} src={src} alt={alt} loading="lazy" />
}

export default LandmarkPhoto
