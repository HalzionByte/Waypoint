"""Vercel serverless entry point.

Vercel builds the Vite app as a static site and forwards everything it does not
serve to this function. The exact path the function receives has varied between
Vercel route configurations (`/api/routes`, `/routes`, or even just `/api` with
the sub-path dropped), so this wrapper normalises all of them instead of betting
on one.

`/health` and `/uploads` are mounted outside the /api namespace in the
application, so they are never prefixed.
"""

import json
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
for extra in (ROOT / "backend", ROOT):
    if str(extra) not in sys.path:
        sys.path.insert(0, str(extra))

from app.main import app as _app  # noqa: E402

# Already-rooted paths: do not prefix these.
_OUTSIDE_PREFIX = ("/health", "/uploads")
# A bare /api means the sub-path never reached us; nothing can recover it.
_BARE = ("/api", "/api/")


def _normalise(path: str) -> str | None:
    """Return the path the app should see, or None if it is unrecoverable."""
    if not path:
        return "/api/"

    if path.startswith(_OUTSIDE_PREFIX):
        return path

    if path in _BARE:
        return None

    if path == "/api":
        return "/api/"

    # Collapse a doubled prefix, e.g. /api/api/routes -> /api/routes.
    if path.startswith("/api/api/"):
        return path[len("/api") :]

    if path.startswith("/api"):
        return path

    # Arrived without the prefix — put it back.
    return "/api" + path


class NormalisePath:
    def __init__(self, app):
        self.app = app

    async def __call__(self, scope, receive, send):
        if scope.get("type") == "http":
            original = scope.get("path", "") or "/"
            fixed = _normalise(original)
            if fixed is None:
                # Report the problem instead of an unexplained 404.
                body = json.dumps(
                    {
                        "detail": "API sub-path was not delivered to the function",
                        "received_path": original,
                        "expected": "e.g. /api/routes",
                    }
                ).encode()
                await _send_json(scope, receive, send, body)
                return
            if fixed != original:
                scope = dict(scope, path=fixed)
                raw = scope.get("raw_path")
                if raw:
                    scope["raw_path"] = fixed.encode()
        await self.app(scope, receive, send)


async def _send_json(scope, receive, send, body: bytes) -> None:
    await send(
        {
            "type": "http.response.start",
            "status": 500,
            "headers": [
                (b"content-type", b"application/json"),
                (b"content-length", str(len(body)).encode()),
            ],
        }
    )
    await send({"type": "http.response.body", "body": body})


app = NormalisePath(_app)
application = app  # some runtimes look for `application`
