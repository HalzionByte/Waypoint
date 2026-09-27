"""WayPoint API — visual last-mile navigation using local landmarks."""

from contextlib import asynccontextmanager
from collections.abc import AsyncIterator
import logging

from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse
from fastapi.staticfiles import StaticFiles

from .config import settings
from .database import init_db
from .routers import auth, community, landmarks, public, routes, verification
from .services.bootstrap import ensure_demo_data


@asynccontextmanager
async def lifespan(_: FastAPI) -> AsyncIterator[None]:
    # Nice to have, not required: the demo endpoint seeds itself on demand, so
    # a platform that skips lifespan still comes up populated.
    try:
        init_db()
        if settings.seed_demo_data:
            ensure_demo_data()
    except Exception:  # noqa: BLE001 - never block startup on the seed
        logging.getLogger("waypoint.bootstrap").exception("startup seed failed")
    yield


app = FastAPI(
    title=settings.app_name,
    version="0.1.0",
    lifespan=lifespan,
    description=(
        "Create and share visual directions built from local landmarks, photos, "
        "and short instructions."
    ),
)

# CORS is only needed when the frontend is served from a different origin
# (Vite in dev, or a split Vercel + container deploy). A single-container deploy
# serves both from one origin and does not need it.
if settings.static_dir is None or not settings.static_dir.is_dir():
    app.add_middleware(
        CORSMiddleware,
        allow_origins=list(settings.cors_origins),
        allow_credentials=True,
        allow_methods=["*"],
        allow_headers=["*"],
    )

app.include_router(auth.router, prefix=settings.api_prefix)
app.include_router(routes.router, prefix=settings.api_prefix)
app.include_router(landmarks.router, prefix=settings.api_prefix)
app.include_router(community.router, prefix=settings.api_prefix)
app.include_router(verification.router, prefix=settings.api_prefix)
app.include_router(public.router, prefix=settings.api_prefix)

# Landmark photos. Swap this mount for S3/R2 in production.
app.mount("/uploads", StaticFiles(directory=settings.upload_dir), name="uploads")


@app.get("/health", tags=["meta"])
def health() -> dict[str, str]:
    return {"status": "ok", "service": settings.app_name}


# --------------------------------------------------------- built frontend (prod)
# When STATIC_DIR points at the Vite build, this container serves the whole site.
# Unmatched paths fall through to index.html so client-side routes like
# /r/<token> and /landmarks deep-link correctly on refresh.
if settings.static_dir is not None and settings.static_dir.is_dir():
    assets = settings.static_dir / "assets"
    if assets.is_dir():
        app.mount("/assets", StaticFiles(directory=assets), name="assets")

    @app.get("/{full_path:path}", include_in_schema=False)
    def spa(full_path: str) -> FileResponse:
        # Never let the SPA fallback swallow API calls: a mistyped endpoint
        # should 404 as JSON, not return HTML the client then fails to parse.
        if full_path == "api" or full_path.startswith("api/"):
            raise HTTPException(status_code=404, detail="Not Found")

        candidate = settings.static_dir / full_path
        if full_path and candidate.is_file():
            # Guard against traversal out of the static root.
            try:
                candidate.resolve().relative_to(settings.static_dir.resolve())
            except ValueError:
                return FileResponse(settings.static_dir / "index.html")
            return FileResponse(candidate)
        return FileResponse(settings.static_dir / "index.html")
