"""Owner dashboard: verification summary and landmarks needing a refresh."""

from __future__ import annotations

from datetime import timedelta

from fastapi import APIRouter
from sqlalchemy import func, or_, select
from sqlalchemy.orm import selectinload
from sqlalchemy.sql.elements import ColumnElement

from ..deps import CurrentUser, DbSession
from ..models import Landmark, Route
from ..schemas import DueLandmarkOut, VerificationSummary
from ..serializers import landmark_out
from ..services import freshness

router = APIRouter(prefix="/verification", tags=["verification"])


@router.get("/summary", response_model=VerificationSummary)
def summary(user: CurrentUser, db: DbSession) -> VerificationSummary:
    now = freshness.utcnow_naive()
    soon = now + timedelta(days=freshness.DUE_SOON_DAYS)

    owned = Landmark.route_id.in_(select(Route.id).where(Route.owner_id == user.id))

    def count(*conditions: ColumnElement[bool]) -> int:
        return db.scalar(select(func.count(Landmark.id)).where(owned, *conditions)) or 0

    total = count()
    overdue = count(
        or_(Landmark.next_verification.is_(None), Landmark.next_verification <= now)
    )
    due_soon = count(
        Landmark.next_verification > now, Landmark.next_verification <= soon
    )

    return VerificationSummary(
        total_routes=db.scalar(
            select(func.count(Route.id)).where(Route.owner_id == user.id)
        )
        or 0,
        total_landmarks=total,
        verified=total - overdue,
        due_soon=due_soon,
        overdue=overdue,
    )


@router.get("/due", response_model=list[DueLandmarkOut])
def due_landmarks(user: CurrentUser, db: DbSession) -> list[DueLandmarkOut]:
    """Overdue first, then soonest due — the creator's re-check worklist."""
    now = freshness.utcnow_naive()
    soon = now + timedelta(days=freshness.DUE_SOON_DAYS)

    rows = db.scalars(
        select(Landmark)
        .join(Route, Route.id == Landmark.route_id)
        .options(selectinload(Landmark.route))
        .where(
            Route.owner_id == user.id,
            or_(
                Landmark.next_verification.is_(None),
                Landmark.next_verification <= soon,
            ),
        )
        .order_by(Landmark.next_verification.asc())
    ).all()

    results: list[DueLandmarkOut] = []
    for landmark in rows:
        results.append(
            DueLandmarkOut(
                **landmark_out(landmark).model_dump(),
                route_title=landmark.route.title,
                days_until_due=freshness.days_until_due(landmark.next_verification),
                status=freshness.status_of(landmark.next_verification),
            )
        )
    return results
