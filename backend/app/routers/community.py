"""Community landmarks: contributed once by a user, reusable by everyone.

The six-month validation window belongs to the contributor. When a landmark
falls out of date it is surfaced to the wider community, who can either upload
a fresh photo (which restarts the clock) or report that it no longer matches.
"""

from __future__ import annotations

from fastapi import APIRouter, File, HTTPException, Query, UploadFile, status
from sqlalchemy import func, or_, select
from sqlalchemy.orm import Session, selectinload

from ..deps import CurrentUser, DbSession, owned_route
from ..models import (
    Landmark,
    LandmarkAction,
    PublicLandmark,
    PublicLandmarkReport,
    User,
)
from ..schemas import (
    LandmarkOut,
    PublicLandmarkCreate,
    PublicLandmarkOut,
    PublicLandmarkUpdate,
    ReportRequest,
    UseInRouteRequest,
)
from ..serializers import landmark_out, public_landmark_out
from ..services import freshness
from ..services.storage import delete_photo, save_photo

router = APIRouter(prefix="/public-landmarks", tags=["community"])

_LOAD = (
    selectinload(PublicLandmark.contributor),
    selectinload(PublicLandmark.last_verified_by),
)


def _load(db: Session, landmark_id: int) -> PublicLandmark:
    # populate_existing matters: after a mutation changes contributor_id or
    # last_verified_by_id, the identity map would otherwise hand back the
    # already-eager-loaded relationship and the UI would show a stale name.
    landmark = db.scalar(
        select(PublicLandmark)
        .options(*_LOAD)
        .where(PublicLandmark.id == landmark_id)
        .execution_options(populate_existing=True)
    )
    if landmark is None:
        raise HTTPException(status_code=404, detail="Community landmark not found")
    return landmark


def _has_reported(db: Session, landmark_id: int, user_id: int) -> bool:
    return (
        db.scalar(
            select(func.count(PublicLandmarkReport.id)).where(
                PublicLandmarkReport.public_landmark_id == landmark_id,
                PublicLandmarkReport.reporter_id == user_id,
            )
        )
        or 0
    ) > 0


def _touch_verification(landmark: PublicLandmark, user: User) -> None:
    now = freshness.utcnow_naive()
    landmark.last_verified = now
    landmark.next_verification = freshness.due_date(now)
    landmark.last_verified_by_id = user.id
    # A fresh observation clears an outstanding "this is outdated" report.
    landmark.is_disputed = False


def _serialise(db: Session, landmark: PublicLandmark, viewer: User) -> PublicLandmarkOut:
    return public_landmark_out(
        landmark, viewer, reported_by_me=_has_reported(db, landmark.id, viewer.id)
    )


# ------------------------------------------------------------------- contribute
@router.post("", response_model=PublicLandmarkOut, status_code=status.HTTP_201_CREATED)
def contribute(payload: PublicLandmarkCreate, user: CurrentUser, db: DbSession) -> PublicLandmarkOut:
    """Publish a landmark to the shared library for anyone to use."""
    now = freshness.utcnow_naive()
    landmark = PublicLandmark(
        contributor_id=user.id,
        name=payload.name.strip(),
        lat=payload.lat,
        lng=payload.lng,
        description=payload.description.strip(),
        last_verified=now,
        next_verification=freshness.due_date(now),
        last_verified_by_id=user.id,
    )
    db.add(landmark)
    db.commit()
    return _serialise(db, _load(db, landmark.id), user)


@router.get("", response_model=list[PublicLandmarkOut])
def list_landmarks(
    user: CurrentUser,
    db: DbSession,
    stale: bool | None = Query(default=None, description="Only unverified landmarks"),
    disputed: bool | None = Query(default=None),
    q: str | None = Query(default=None, max_length=160),
    limit: int = Query(default=100, ge=1, le=200),
) -> list[PublicLandmarkOut]:
    now = freshness.utcnow_naive()
    query = select(PublicLandmark).options(*_LOAD)

    if q:
        pattern = f"%{q.strip()}%"
        query = query.where(
            or_(PublicLandmark.name.ilike(pattern), PublicLandmark.description.ilike(pattern))
        )
    if stale is True:
        query = query.where(
            or_(
                PublicLandmark.next_verification.is_(None),
                PublicLandmark.next_verification <= now,
            )
        )
    elif stale is False:
        query = query.where(PublicLandmark.next_verification > now)
    if disputed is not None:
        query = query.where(PublicLandmark.is_disputed.is_(disputed))

    # Outdated first, then most used — the useful order for a demo.
    landmarks = db.scalars(
        query.order_by(
            PublicLandmark.next_verification.asc(), PublicLandmark.times_used.desc()
        ).limit(limit)
    ).all()
    return [_serialise(db, lm, user) for lm in landmarks]


@router.get("/{landmark_id}", response_model=PublicLandmarkOut)
def get_landmark(landmark_id: int, user: CurrentUser, db: DbSession) -> PublicLandmarkOut:
    return _serialise(db, _load(db, landmark_id), user)


@router.patch("/{landmark_id}", response_model=PublicLandmarkOut)
def update_landmark(
    landmark_id: int, payload: PublicLandmarkUpdate, user: CurrentUser, db: DbSession
) -> PublicLandmarkOut:
    landmark = _load(db, landmark_id)
    if landmark.contributor_id != user.id:
        raise HTTPException(
            status_code=403, detail="Only the contributor can edit this landmark"
        )
    for field, value in payload.model_dump(exclude_unset=True).items():
        setattr(landmark, field, value)
    db.commit()
    return _serialise(db, _load(db, landmark_id), user)


# ---------------------------------------------------------------- keep it fresh
@router.post("/{landmark_id}/photo", response_model=PublicLandmarkOut)
async def upload_photo(
    landmark_id: int, user: CurrentUser, db: DbSession, file: UploadFile = File(...)
) -> PublicLandmarkOut:
    """Anyone can re-photograph an outdated landmark — that is a fresh look at
    the real world, so it restarts the contributor's validation window."""
    landmark = _load(db, landmark_id)
    stored = await save_photo(file)

    previous = landmark.photo_url
    landmark.photo_url = stored.url
    _touch_verification(landmark, user)

    db.commit()
    if previous and previous != stored.url:
        delete_photo(previous)
    return _serialise(db, _load(db, landmark_id), user)


@router.post("/{landmark_id}/verify", response_model=PublicLandmarkOut)
def verify_landmark(landmark_id: int, user: CurrentUser, db: DbSession) -> PublicLandmarkOut:
    """'Still looks the same.' Reserved for the contributing account."""
    landmark = _load(db, landmark_id)
    if landmark.contributor_id != user.id:
        raise HTTPException(
            status_code=403,
            detail="Only the contributor can confirm this landmark",
        )
    _touch_verification(landmark, user)
    db.commit()
    return _serialise(db, _load(db, landmark_id), user)


@router.post("/{landmark_id}/report", response_model=PublicLandmarkOut)
def report_outdated(
    landmark_id: int, payload: ReportRequest, user: CurrentUser, db: DbSession
) -> PublicLandmarkOut:
    """Flag a landmark as no longer matching reality. One report per user."""
    landmark = _load(db, landmark_id)
    if landmark.contributor_id == user.id:
        raise HTTPException(
            status_code=400, detail="This is your landmark — refresh it instead of reporting it"
        )
    if _has_reported(db, landmark.id, user.id):
        raise HTTPException(status_code=409, detail="You have already reported this landmark")

    db.add(
        PublicLandmarkReport(
            public_landmark_id=landmark.id,
            reporter_id=user.id,
            note=payload.note.strip(),
        )
    )
    landmark.report_count += 1
    landmark.is_disputed = True
    db.commit()
    return _serialise(db, _load(db, landmark_id), user)


# ------------------------------------------------------------------ use in route
@router.post("/{landmark_id}/use", response_model=LandmarkOut, status_code=status.HTTP_201_CREATED)
def use_in_route(
    landmark_id: int, payload: UseInRouteRequest, user: CurrentUser, db: DbSession
) -> LandmarkOut:
    """Add a community landmark as a step in one of the caller's own routes."""
    public = _load(db, landmark_id)
    route = owned_route(db, payload.route_id, user)

    last = db.scalar(
        select(Landmark)
        .where(Landmark.route_id == route.id)
        .order_by(Landmark.position.desc())
        .limit(1)
    )
    action = LandmarkAction.PASS
    step = Landmark(
        route_id=route.id,
        position=(last.position + 1) if last else 0,
        name=public.name,
        photo_url=public.photo_url,
        lat=public.lat,
        lng=public.lng,
        description=public.description,
        action=action,
        instruction=f"Pass the {public.name}.",
        # Freshness is read from the public landmark, so this copy needs no dates.
        last_verified=public.last_verified,
        next_verification=public.next_verification,
        public_landmark_id=public.id,
    )
    db.add(step)
    public.times_used += 1
    route.updated_at = freshness.utcnow_naive()
    db.commit()
    db.refresh(step)
    return landmark_out(step)
