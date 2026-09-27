"""Application configuration loaded from environment variables / .env file."""

from __future__ import annotations

from functools import lru_cache
from pathlib import Path

from pydantic_settings import BaseSettings, SettingsConfigDict

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
    max_upload_bytes: int = 8 * 1024 * 1024  # 8 MB
    allowed_image_types: tuple[str, ...] = (
        "image/jpeg",
        "image/png",
        "image/webp",
        "image/gif",
    )

    # Public base URL used when generating QR codes / share links.
    public_base_url: str = "http://localhost:5173"

    # A landmark must be re-confirmed within this many days (PRD: 6 months).
    verification_days: int = 180

    # Path to the built frontend (npm run build). In the Docker image this lets a
    # single container serve both the API and the site, giving one public URL and
    # no CORS to configure. Unset in dev, where Vite serves the frontend.
    static_dir: Path | None = None

    cors_origins: tuple[str, ...] = (
        "http://localhost:5173",
        "http://127.0.0.1:5173",
    )


@lru_cache
def get_settings() -> Settings:
    settings = Settings()
    settings.upload_dir.mkdir(parents=True, exist_ok=True)
    return settings


settings = get_settings()
