"""Landmark freshness helpers (PRD section 10).

Every landmark gets a verification window. Once it expires the landmark is
"stale" and the owner is prompted to confirm it or upload a fresh photo.
"""

from __future__ import annotations

from datetime import datetime, timedelta, timezone

from ..config import settings

# A landmark counts as "due soon" once it is inside this window.
DUE_SOON_DAYS = 30


def _as_utc(value: datetime | None) -> datetime | None:
    """SQLite drops tzinfo; treat naive timestamps as UTC."""
    if value is None:
        return None
    return value if value.tzinfo else value.replace(tzinfo=timezone.utc)


def utcnow_naive() -> datetime:
    """Naive UTC 'now' for SQL comparisons.

    SQLite's DATETIME column drops tzinfo, so every timestamp is stored as UTC
    wall time. Query predicates must therefore use naive values.
    """
    return datetime.now(timezone.utc).replace(tzinfo=None)


def due_date(from_: datetime | None = None) -> datetime:
    base = from_ or datetime.now(timezone.utc)
    return base + timedelta(days=settings.verification_days)


def initial_verification() -> tuple[datetime, datetime]:
    """A brand new landmark counts as verified the day it is created."""
    now = datetime.now(timezone.utc)
    return now, due_date(now)


def is_stale(next_verification: datetime | None) -> bool:
    due = _as_utc(next_verification)
    if due is None:
        return True
    return due < datetime.now(timezone.utc)


def is_due_soon(next_verification: datetime | None, window_days: int = DUE_SOON_DAYS) -> bool:
    due = _as_utc(next_verification)
    if due is None:
        return True
    now = datetime.now(timezone.utc)
    return due >= now and due <= now + timedelta(days=window_days)


def days_until_due(next_verification: datetime | None) -> int | None:
    due = _as_utc(next_verification)
    if due is None:
        return None
    return (due - datetime.now(timezone.utc)).days


def status_of(next_verification: datetime | None) -> str:
    if is_stale(next_verification):
        return "overdue"
    if is_due_soon(next_verification):
        return "due_soon"
    return "verified"
