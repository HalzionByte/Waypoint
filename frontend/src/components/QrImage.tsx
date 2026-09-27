import { useQrDataUrl } from '../lib/useQrDataUrl'

/**
 * A QR code for a link, drawn in the browser.
 *
 * Fails soft: if the text will not fit in a QR code, or the environment has no
 * canvas, this shows a note instead of a broken image, because the text link
 * beside it still works.
 */
export default function QrImage({
  text,
  alt,
  size = 320,
}: {
  text: string
  alt: string
  size?: number
}) {
  const url = useQrDataUrl(text, size)

  if (!url) {
    return (
      <div className="photo-placeholder photo-placeholder--flat">
        QR code unavailable — use the link above.
      </div>
    )
  }
  return <img src={url} alt={alt} />
}

/**
 * The same PNG as a download, rendered at print resolution. Only mounted once
 * the data URL exists, so the button is never a link that goes nowhere.
 */
export function QrDownload({ text, name }: { text: string; name: string }) {
  const url = useQrDataUrl(text, 720)

  if (!url) return null
  return (
    <a className="btn btn--ghost btn--sm" href={url} download={`${name}.png`}>
      Download QR
    </a>
  )
}
