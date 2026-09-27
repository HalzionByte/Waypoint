import { useId, useRef, useState } from 'react'

import { photoUrl as photoUrlOf } from './imgUrl'
import { validatePhoto } from '../lib/upload'

interface Props {
  /** Saved URL, or a local object URL while composing a new landmark. */
  photoUrl: string | null
  onSelect: (file: File) => void
  onClear?: () => void
  alt?: string
  hint?: string
  busy?: boolean
}

/**
 * Photo picker shared by the "add a landmark" card and the landmark editor.
 *
 * The file input is visually hidden but stays focusable, so the whole tile
 * behaves like a real button for keyboard and screen-reader users.
 */
export default function PhotoField({
  photoUrl: photoUrlProp,
  onSelect,
  onClear,
  alt = '',
  hint,
  busy = false,
}: Props) {
  // Resolve against the API origin for split deploys; a no-op when same-origin.
  const photoUrl = photoUrlOf(photoUrlProp)
  const inputRef = useRef<HTMLInputElement>(null)
  const [error, setError] = useState('')
  const inputId = useId()

  function handleChange(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0]
    // Reset immediately so re-picking the same file still fires a change.
    event.target.value = ''
    if (!file) return

    const problem = validatePhoto(file)
    setError(problem ?? '')
    if (!problem) onSelect(file)
  }

  return (
    <div className="photo-field">
      {photoUrl ? (
        <>
          <img className="photo-field__img" src={photoUrl} alt={alt} />
          <div className="photo-field__actions">
            <label className="btn btn--ghost btn--sm photo-field__btn" htmlFor={inputId}>
              {busy ? 'Uploading…' : 'Replace photo'}
            </label>
            {onClear && (
              <button type="button" className="linkish" onClick={onClear}>
                Remove
              </button>
            )}
          </div>
        </>
      ) : (
        <label className="photo-drop" htmlFor={inputId}>
          <span className="photo-drop__icon" aria-hidden>
            +
          </span>
          <span>
            <strong>Add a photo</strong>
            <small>A current photo is what makes a gate recognisable.</small>
          </span>
        </label>
      )}

      <input
        ref={inputRef}
        id={inputId}
        className="sr-only"
        type="file"
        accept="image/*"
        onChange={handleChange}
      />

      {error && <p className="photo-field__error">{error}</p>}
      {!error && hint && <small className="photo-field__hint">{hint}</small>}
    </div>
  )
}
