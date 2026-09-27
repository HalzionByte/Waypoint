"""Local photo storage for landmark images.

Kept behind a small interface so it can be swapped for S3/Cloudflare R2 later
(PRD section 12: "object/cloud storage for landmark photos").
"""

from __future__ import annotations

import secrets
from dataclasses import dataclass
from pathlib import Path

from fastapi import HTTPException, UploadFile, status

from ..config import settings

_EXTENSIONS = {
    "image/jpeg": ".jpg",
    "image/png": ".png",
    "image/webp": ".webp",
    "image/gif": ".gif",
}


@dataclass(frozen=True)
class StoredPhoto:
    filename: str
    url: str
    size: int


def media_url(path: str | None) -> str | None:
    """Expand a stored relative photo path for the browser.

    Photos live in the database as "/uploads/<file>" so the rows stay portable
    and delete_photo() can reason about them. That relative form only works when
    the site and the API share an origin. With the frontend on Vercel and the API
    on Render they do not, so the API's own origin is prepended on the way out.
    """
    if not path or not path.startswith("/"):
        return path
    base = settings.public_api_base.rstrip("/")
    return f"{base}{path}" if base else path


async def save_photo(upload: UploadFile) -> StoredPhoto:
    content_type = (upload.content_type or "").split(";")[0].strip().lower()
    if content_type not in settings.allowed_image_types:
        allowed = ", ".join(sorted(settings.allowed_image_types))
        raise HTTPException(
            status_code=status.HTTP_415_UNSUPPORTED_MEDIA_TYPE,
            detail=f"Unsupported image type '{content_type}'. Allowed: {allowed}",
        )

    data = await upload.read()
    if not data:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST, detail="Uploaded file is empty"
        )
    if len(data) > settings.max_upload_bytes:
        limit_mb = settings.max_upload_bytes // (1024 * 1024)
        raise HTTPException(
            status_code=status.HTTP_413_REQUEST_ENTITY_TOO_LARGE,
            detail=f"Image is larger than the {limit_mb} MB limit",
        )

    root: Path = settings.upload_dir
    root.mkdir(parents=True, exist_ok=True)
    filename = f"{secrets.token_hex(12)}{_EXTENSIONS[content_type]}"
    (root / filename).write_bytes(data)

    return StoredPhoto(filename=filename, url=f"/uploads/{filename}", size=len(data))


def delete_photo(photo_url: str | None) -> None:
    """Best-effort cleanup; only touches files inside the upload directory."""
    if not photo_url or not photo_url.startswith("/uploads/"):
        return
    name = Path(photo_url).name
    root: Path = settings.upload_dir.resolve()
    target = (root / name).resolve()
    if target.parent == root and target.is_file():
        target.unlink(missing_ok=True)
