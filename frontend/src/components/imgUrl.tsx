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
 * The API returns a plain URL (`/uploads/…`, made absolute by `PUBLIC_API_BASE`
 * when the site and the API are on different origins), so there is nothing to
 * resolve here. Callers that are previewing a not-yet-uploaded file pass a local
 * object URL, which an <img> loads just as happily.
 */
export function LandmarkPhoto({
  photoUrl,
  alt,
  className,
  placeholder = 'No photo for this landmark',
  placeholderClassName = 'photo-placeholder--flat',
}: PhotoProps) {
  if (!photoUrl) {
    if (!placeholder) return null
    return <div className={`photo-placeholder ${placeholderClassName}`}>{placeholder}</div>
  }
  return <img className={className} src={photoUrl} alt={alt} loading="lazy" />
}

export default LandmarkPhoto