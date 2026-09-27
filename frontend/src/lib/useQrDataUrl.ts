import { useEffect, useState } from 'react'

import QRCode from 'qrcode'

/**
 * A QR code as a PNG data URL, drawn in the browser.
 *
 * The backend used to render this; with no server it is generated here. The
 * <img> src and the download href can be the same data URL, so the Download
 * button needs no extra plumbing.
 */
export function useQrDataUrl(text: string, size = 320): string | null {
  const [url, setUrl] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false

    void QRCode.toDataURL(text, {
      width: size,
      margin: 2,
      errorCorrectionLevel: 'M',
      color: { dark: '#12203a', light: '#ffffff' },
    })
      .then((dataUrl) => {
        if (!cancelled) setUrl(dataUrl)
      })
      .catch(() => {
        // Too much data for a QR code, or no canvas support. Showing nothing
        // beats showing a broken image; the text link still works.
        if (!cancelled) setUrl(null)
      })

    return () => {
      cancelled = true
    }
  }, [text, size])

  return url
}

export default useQrDataUrl
