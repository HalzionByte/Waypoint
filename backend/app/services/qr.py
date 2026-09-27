"""Share link + QR code generation (PRD sections 7 and 11)."""

from __future__ import annotations

import io

import qrcode
from qrcode.constants import ERROR_CORRECT_M

from ..config import settings


def share_url(token: str) -> str:
    return f"{settings.public_base_url.rstrip('/')}/r/{token}"


def qr_png(token: str, box_size: int = 10, border: int = 2) -> bytes:
    """Render the route's share link as a PNG QR code."""
    qr = qrcode.QRCode(
        version=None,
        error_correction=ERROR_CORRECT_M,
        box_size=box_size,
        border=border,
    )
    qr.add_data(share_url(token))
    qr.make(fit=True)
    image = qr.make_image(fill_color="black", back_color="white")
    buffer = io.BytesIO()
    image.save(buffer, format="PNG")
    return buffer.getvalue()
