"""Application configuration loaded from environment variables / .env file."""

from __future__ import annotations

from functools import lru_cache
import json
from pathlib import Path
from typing import Annotated

from pydantic import field_validator
from pydantic_settings import BaseSettings, NoDecode, SettingsConfigDict

BASE_DIR = Path(__file__).resolve().parent.parent

# The shared demo account. Public by design: it exists so a hackathon judge can
# click around without registering. Never point this at a real account.
DEMO_EMAIL = "demo@waypoint.app"
DEMO_PASSWORD = "demo1234"


class Settings(BaseSettings):
    model_config = SettingsConfigDict(
        env_file=(BASE_DIR / ".env"),
        env_file_encoding="utf-8",
        extra="ignore",
    )

    app_name: str = "WayPoint API"
    api_prefix: str = "/api"
    debug: bool = True

    # SQLite by default so the MVP runs with zero setup. Point this at
    # postgresql+psycopg://user:pass@host:5432/waypoint for production.
    database_url: str = f"sqlite:///{(BASE_DIR / 'waypoint.db').as_posix()}"

    # Populate the demo account and sample routes on boot when the database is
    # empty, so a fresh deploy is immediately demo-able. Idempotent.
    seed_demo_data: bool = True

    # Let anyone sign in as the demo account without typing credentials, so a
    # visitor lands in a working app. Turn OFF for anything real.
    demo_auto_login: bool = True

    # Dev-only default. Override via JWT_SECRET in .env before deploying.
    jwt_secret: str = "waypoint-dev-only-insecure-secret-change-me"
    jwt_algorithm: str = "HS256"
    access_token_minutes: int = 60 * 24 * 7  # 7 days

    upload_dir: Path = BASE_DIR / "uploads"
    # An empty value must mean "unset", not Path(".") — otherwise the API would
    # think it has a frontend to serve and shadow its own routes.
    @field_validator("static_dir", mode="before")
    @classmethod
    def _blank_is_none(cls, value: object) -> object:
        if isinstance(value, str) and not value.strip():
            return None
        return value

    # Accepts both a JSON array and a friendlier comma-separated list, so
    # CORS_ORIGINS works in a Render/Vercel dashboard input box.
    @field_validator("cors_origins", mode="before")
    @classmethod
    def _split_origins(cls, value: object) -> object:
        if isinstance(value, str):
            text = value.strip()
            if text.startswith("["):
                return json.loads(text)
            return [part.strip() for part in text.split(",") if part.strip()]
        return value
    max_upload_bytes: int = 8 * 1024 * 1024  # 8 MB
    allowed_image_types: tuple[str, ...] = (
        "image/jpeg",
        "image/png",
        "image/webp",
        "image/gif",
    )

    # Public base URL used when generating QR codes / share links. In a split
    # deploy this is the FRONTEND's URL, so recipients land on the site rather
    # than on the API.
    public_base_url: str = "http://localhost:5173"

    # Absolute origin of THIS api, e.g. https://waypoint-api.onrender.com.
    # Photo paths are stored in the database as relative (/uploads/x.jpg) and are
    # only expanded to absolute URLs on the way out when this is set. Without it
    # a split deploy serves the site from Vercel and every photo 404s, because
    # the browser resolves /uploads/... against the site's own origin.
    public_api_base: str = ""

    # A landmark must be re-confirmed within this many days (PRD: 6 months).
    verification_days: int = 180

    # Path to the built frontend (npm run build). In the Docker image this lets a
    # single container serve both the API and the site, giving one public URL and
    # no CORS to configure. Unset in dev, where Vite serves the frontend.
    static_dir: Path | None = None

    # NoDecode stops pydantic-settings from trying to json.loads() the env value
    # first, which is what makes a plain comma-separated list possible. Without
    # it, CORS_ORIGINS=https://a.app,https://b.app is a hard startup crash.
    cors_origins: Annotated[tuple[str, ...], NoDecode] = (
        "http://localhost:5173",
        "http://127.0.0.1:5173",
    )


@lru_cache
def get_settings() -> Settings:
    settings = Settings()
    settings.upload_dir.mkdir(parents=True, exist_ok=True)
    return settings


settings = get_settings()
