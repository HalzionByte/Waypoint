"""Vercel serverless entry point.

Vercel builds the Vite app as a static site and forwards everything it does not
serve to this function.

Two things this has to get right:

1. **Path prefix.** Depending on the route config, Vercel may hand us
   "/api/routes" or strip the prefix and hand us "/routes". Both must work, so
   a thin middleware normalises anything without the prefix rather than betting
   on one behaviour.
2. **Ephemeral storage.** Vercel's filesystem is per-invocation and wiped on
   recycle, so vercel.json points DATABASE_URL and UPLOAD_DIR at /tmp. Demo
   data re-seeds on every cold start, so a judge always finds the app populated,
   but anything a visitor creates is lost when the instance recycles.

Paths that are already mounted outside the /api namespace are left alone:
/health and /uploads must not be prefixed.
"""

import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
for extra in (ROOT / "backend", ROOT):
    if str(extra) not in sys.path:
        sys.path.insert(0, str(extra))

from app.main import app as _app  # noqa: E402

_PREFIX_ALREADY = ("/api", "/health", "/uploads")


class NormaliseApiPrefix:
    """Ensure every API call arrives at the app with its /api prefix intact."""

    def __init__(self, app):
        self.app = app

    async def __call__(self, scope, receive, send):
        if scope.get("type") == "http":
            path = scope.get("path", "") or "/"
            if not path.startswith(_PREFIX_ALREADY):
                scope = dict(scope)
                scope["path"] = "/api" + path
                raw = scope.get("raw_path")
                if raw:
                    scope["raw_path"] = b"/api" + raw
        await self.app(scope, receive, send)


app = NormaliseApiPrefix(_app)
application = app  # some runtimes look for `application`
