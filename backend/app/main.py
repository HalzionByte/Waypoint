"""WayPoint API — visual last-mile navigation using local landmarks."""

from contextlib import asynccontextmanager
from collections.abc import AsyncIterator
import logging

from fastapi import FastAPI, HTTPException, Request
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

    # Render's dashboard is the only window into a misconfigured deploy, so log
    # the settings that are easy to get wrong rather than failing silently.
    logging.getLogger("waypoint").info(
        "startup: db=%s uploads=%s seed=%s demo_login=%s frontend=%s api_base=%s",
        settings.database_url,
        settings.upload_dir,
        settings.seed_demo_data,
        settings.demo_auto_login,
        settings.public_base_url,
        settings.public_api_base or "(relative photo URLs)",
    )
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
# (Vite in dev, or a split Vercel + Render deploy). A single-container deploy
# serves both from one origin and does not need it.
if settings.static_dir is None or not settings.static_dir.is_dir():
    # No explicit CORS_ORIGINS means the list is still the localhost default,
    # i.e. nobody set it up. In that case allow any origin rather than failing
    # every request from the deployed site with a CORS error the user cannot see
    # in the browser. Safe here because auth is a Bearer token, not a cookie, so
    # nothing is gained by locking the origin down — and it stays open even if a
    # request smuggles credentials, because allow_credentials is False.
    default_origins = {"http://localhost:5173", "http://127.0.0.1:5173"}
    configured = tuple(settings.cors_origins)
    wildcard = set(configured) == default_origins
    origins = ["*"] if wildcard else list(configured)

    app.add_middleware(
        CORSMiddleware,
        allow_origins=origins,
        allow_credentials=not wildcard,
        allow_methods=["*"],
        allow_headers=["*"],
    )
    logging.getLogger("waypoint").info(
        "CORS origins: %s",
        "* (unset CORS_ORIGINS - any origin allowed)" if wildcard else origins,
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


@app.get("/health/config", tags=["meta"])
def health_config(request: Request) -> dict[str, object]:
    """Deploy sanity check, readable without an account.

    Open this in a browser to confirm the API is up and that the frontend can
    actually reach it. `caller_origin_allowed` is the field that matters when
    the site loads but shows no data: false here means the Vercel origin is
    missing from CORS_ORIGINS, and the browser is silently dropping every
    request.
    """
    origin = request.headers.get("origin")
    allowed = list(settings.cors_origins)
    return {
        "status": "ok",
        "caller_origin": origin,
        "caller_origin_allowed": (
            "*" in allowed
            or not settings.static_dir
            or origin is None
            or origin in allowed
        ),
        "database": settings.database_url,
        "upload_dir": str(settings.upload_dir),
        "public_base_url": settings.public_base_url,
        "public_api_base": settings.public_api_base or "(relative photo URLs)",
        "cors_origins": allowed,
        "seed_demo_data": settings.seed_demo_data,
        "demo_auto_login": settings.demo_auto_login,
        "verification_days": settings.verification_days,
    }


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
