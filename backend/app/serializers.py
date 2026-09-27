"""ORM -> schema conversion shared by the owner-facing and public routers."""

from __future__ import annotations

from sqlalchemy import Integer, cast, func, or_, select
from sqlalchemy.orm import Session

from .models import Landmark, PublicLandmark, Route, User
from .schemas import (
    LandmarkCounts,
    LandmarkOut,
    PublicLandmarkOut,
    RouteOut,
)
from .services import freshness
from .services.qr import share_url


def landmark_out(landmark: Landmark) -> LandmarkOut:
    data = LandmarkOut.model_validate(landmark)
    data.public_landmark_id = landmark.public_landmark_id

    # A step that reuses a community landmark is a *view* of it, not a copy:
    # the physical facts and the six-month window belong to the contributor.
    # Overriding them here means one refresh updates every route at once, and
    # recipients can never be shown an outdated photo.
    source = landmark.public_landmark
    if source is not None:
        data.photo_url = source.photo_url
        data.lat = source.lat
        data.lng = source.lng
        data.last_verified = source.last_verified
        data.next_verification = source.next_verification

    data.is_stale = freshness.is_stale(data.next_verification)
    return data


def public_landmark_out(
    landmark: PublicLandmark, viewer: User | None, reported_by_me: bool
) -> PublicLandmarkOut:
    is_mine = viewer is not None and landmark.contributor_id == viewer.id
    return PublicLandmarkOut(
        id=landmark.id,
        name=landmark.name,
        photo_url=landmark.photo_url,
        lat=landmark.lat,
        lng=landmark.lng,
        description=landmark.description,
        contributor_id=landmark.contributor_id,
        contributor_name=landmark.contributor.name if landmark.contributor else "Unknown",
        last_verified_by=(
            landmark.last_verified_by.name if landmark.last_verified_by is not None else None
        ),
        created_at=landmark.created_at,
        last_verified=landmark.last_verified,
        next_verification=landmark.next_verification,
        is_stale=freshness.is_stale(landmark.next_verification),
        is_disputed=landmark.is_disputed,
        report_count=landmark.report_count,
        times_used=landmark.times_used,
        is_mine=is_mine,
        # The authoritative six-month check stays with the contributing account.
        can_verify=is_mine,
        reported_by_me=reported_by_me,
    )


def route_counts(db: Session, route_ids: list[int]) -> dict[int, LandmarkCounts]:
    """Batch landmark counts for many routes in a single query."""
    if not route_ids:
        return {}

    now = freshness.utcnow_naive()
    # The cast matters: sum() over a boolean expression inherits Boolean type,
    # and SQLite's bool result processor then collapses the total to
    # True/False (so 5 verified landmarks would be reported as 1).
    verified = cast(Landmark.next_verification > now, Integer)
    stale = cast(
        or_(Landmark.next_verification.is_(None), Landmark.next_verification <= now), Integer
    )

    rows = db.execute(
        select(
            Landmark.route_id,
            func.count(Landmark.id),
            func.sum(verified),
            func.sum(stale),
        )
        .where(Landmark.route_id.in_(route_ids))
        .group_by(Landmark.route_id)
    ).all()

    return {
        row[0]: LandmarkCounts(total=row[1] or 0, verified=row[2] or 0, stale=row[3] or 0)
        for row in rows
    }


def route_out(route: Route, counts: LandmarkCounts) -> RouteOut:
    # Built field by field: model_validate() has no `update` hook, and
    # share_url / landmark_counts are computed rather than stored columns.
    return RouteOut(
        id=route.id,
        owner_id=route.owner_id,
        title=route.title,
        destination_name=route.destination_name,
        destination_address=route.destination_address,
        destination_lat=route.destination_lat,
        destination_lng=route.destination_lng,
        share_token=route.share_token,
        share_url=share_url(route.share_token),
        is_published=route.is_published,
        created_at=route.created_at,
        updated_at=route.updated_at,
        landmark_counts=counts,
    )
