"""Landmark editing, photo upload, and the six-month re-verification flow."""

from __future__ import annotations

from fastapi import APIRouter, File, HTTPException, Response, UploadFile, status
from sqlalchemy import select

from ..deps import CurrentUser, DbSession, owned_landmark
from ..models import Landmark, Route
from ..schemas import LandmarkOut, LandmarkUpdate, PhotoUploadOut
from ..serializers import landmark_out
from ..services import freshness
from ..services.storage import delete_photo, save_photo

router = APIRouter(prefix="/landmarks", tags=["landmarks"])


@router.patch("/{landmark_id}", response_model=LandmarkOut)
def update_landmark(
    landmark_id: int, payload: LandmarkUpdate, user: CurrentUser, db: DbSession
) -> LandmarkOut:
    landmark = owned_landmark(db, landmark_id, user)
    changes = payload.model_dump(exclude_unset=True)

    # Changing what the landmark looks like invalidates the previous check-in.
    appearance_changed = any(
        changes.get(field) is not None for field in ("name", "photo_url", "description", "instruction")
    )
    for field, value in changes.items():
        setattr(landmark, field, value)

    if appearance_changed:
        landmark.last_verified = freshness.utcnow_naive()
        landmark.next_verification = freshness.due_date(landmark.last_verified)

    route = db.get(Route, landmark.route_id)
    if route is not None:
        route.updated_at = freshness.utcnow_naive()

    db.commit()
    db.refresh(landmark)
    return landmark_out(landmark)


@router.delete("/{landmark_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_landmark(landmark_id: int, user: CurrentUser, db: DbSession) -> Response:
    landmark = owned_landmark(db, landmark_id, user)
    delete_photo(landmark.photo_url)
    db.delete(landmark)
    db.commit()
    _compact_positions(db, landmark.route_id)
    db.commit()
    return Response(status_code=status.HTTP_204_NO_CONTENT)


@router.post("/{landmark_id}/photo", response_model=PhotoUploadOut)
async def upload_photo(
    landmark_id: int, user: CurrentUser, db: DbSession, file: UploadFile = File(...)
) -> PhotoUploadOut:
    landmark = owned_landmark(db, landmark_id, user)
    stored = await save_photo(file)

    previous = landmark.photo_url
    landmark.photo_url = stored.url
    # A new photo is a fresh observation, so the clock restarts.
    landmark.last_verified = freshness.utcnow_naive()
    landmark.next_verification = freshness.due_date(landmark.last_verified)

    route = db.get(Route, landmark.route_id)
    if route is not None:
        route.updated_at = freshness.utcnow_naive()

    db.commit()

    if previous and previous != stored.url:
        delete_photo(previous)
    return PhotoUploadOut(photo_url=stored.url)


@router.post("/{landmark_id}/verify", response_model=LandmarkOut)
def verify_landmark(landmark_id: int, user: CurrentUser, db: DbSession) -> LandmarkOut:
    """Owner confirms the landmark still looks the same; resets the 6-month clock."""
    landmark = owned_landmark(db, landmark_id, user)
    now = freshness.utcnow_naive()
    landmark.last_verified = now
    landmark.next_verification = freshness.due_date(now)
    db.commit()
    db.refresh(landmark)
    return landmark_out(landmark)


def _compact_positions(db: DbSession, route_id: int) -> None:
    """Re-pack positions to 0..n-1 so gaps don't accumulate after a delete."""
    landmarks = db.scalars(
        select(Landmark)
        .where(Landmark.route_id == route_id)
        .order_by(Landmark.position)
    ).all()
    for index, landmark in enumerate(landmarks):
        if landmark.position != index:
            landmark.position = -(index + 1)
    db.flush()
    for index, landmark in enumerate(landmarks):
        landmark.position = index
