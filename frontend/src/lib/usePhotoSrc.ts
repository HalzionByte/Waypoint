import { useEffect, useState } from 'react'

import { isPhotoRef, readPhotoBlob } from './store'

/**
 * Resolve a landmark photo reference to something an <img> can load.
 *
 * Photos live in IndexedDB as Blobs, referenced as `photo:<id>`, which an
 * <img> cannot read. Those are resolved to an object URL and revoked on
 * unmount — without revoking, every photo a judge browses stays pinned in
 * memory for the life of the tab.
 *
 * A value that is already a usable URL (an object URL for a photo still being
 * composed, or an http/data URL) is returned as-is during render rather than
 * pushed through state, which would cost an extra render on every change.
 */
export function usePhotoSrc(ref: string | null | undefined): string | null {
  const [resolved, setResolved] = useState<{ ref: string; url: string } | null>(null)

  useEffect(() => {
    if (!isPhotoRef(ref)) return undefined

    let revoked = false
    let objectUrl: string | null = null

    void readPhotoBlob(ref).then((blob) => {
      if (revoked || !blob) return
      objectUrl = URL.createObjectURL(blob)
      setResolved({ ref, url: objectUrl })
    })

    return () => {
      revoked = true
      if (objectUrl) URL.revokeObjectURL(objectUrl)
    }
  }, [ref])

  if (!ref) return null
  if (!isPhotoRef(ref)) return ref
  // Stale until the effect for this exact ref resolves.
  return resolved?.ref === ref ? resolved.url : null
}

export default usePhotoSrc
