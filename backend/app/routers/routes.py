"""Owner-facing route CRUD, sharing, and QR codes."""

from __future__ import annotations

import io

from fastapi import APIRouter, HTTPException, Query, Response, status
from sqlalchemy import select

from ..deps import CurrentUser, DbSession, owned_route
from ..models import Landmark, Route, new_share_token
from ..schemas import (
    LandmarkCounts,
    LandmarkCreate,
    LandmarkOut,
    ReorderRequest,
    RouteCreate,
    RouteDetail,
    RouteOut,
    RouteUpdate,
)
from ..serializers import landmark_out, route_counts, route_out
from ..services import freshness
from ..services.qr import qr_png, share_url

router = APIRouter(prefix="/routes", tags=["routes"])


@router.get("", response_model=list[RouteOut])
def list_routes(user: CurrentUser, db: DbSession) -> list[RouteOut]:
    routes = db.scalars(
        select(Route).where(Route.owner_id == user.id).order_by(Route.updated_at.desc())
    ).all()
    counts = route_counts(db, [r.id for r in routes])
    empty = LandmarkCounts(total=0, verified=0, stale=0)
    return [route_out(r, counts.get(r.id, empty)) for r in routes]


@router.post("", response_model=RouteDetail, status_code=status.HTTP_201_CREATED)
def create_route(payload: RouteCreate, user: CurrentUser, db: DbSession) -> RouteDetail:
    route = Route(owner_id=user.id, **payload.model_dump())
    db.add(route)
    db.commit()
    db.refresh(route)
    return RouteDetail(
        **route_out(route, LandmarkCounts(total=0, verified=0, stale=0)).model_dump(),
        landmarks=[],
    )


@router.get("/{route_id}", response_model=RouteDetail)
def get_route(route_id: int, user: CurrentUser, db: DbSession) -> RouteDetail:
    route = owned_route(db, route_id, user)
    counts = route_counts(db, [route.id]).get(route.id, LandmarkCounts(total=0, verified=0, stale=0))
    return RouteDetail(
        **route_out(route, counts).model_dump(),
        landmarks=[landmark_out(lm) for lm in route.landmarks],
    )


@router.patch("/{route_id}", response_model=RouteDetail)
def update_route(
    route_id: int, payload: RouteUpdate, user: CurrentUser, db: DbSession
) -> RouteDetail:
    route = owned_route(db, route_id, user)
    for field, value in payload.model_dump(exclude_unset=True).items():
        setattr(route, field, value)
    db.commit()
    db.refresh(route)
    counts = route_counts(db, [route.id]).get(route.id, LandmarkCounts(total=0, verified=0, stale=0))
    return RouteDetail(
        **route_out(route, counts).model_dump(),
        landmarks=[landmark_out(lm) for lm in route.landmarks],
    )


@router.delete("/{route_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_route(route_id: int, user: CurrentUser, db: DbSession) -> Response:
    route = owned_route(db, route_id, user)
    db.delete(route)
    db.commit()
    return Response(status_code=status.HTTP_204_NO_CONTENT)


@router.post("/{route_id}/share/rotate", response_model=RouteOut)
def rotate_share_token(route_id: int, user: CurrentUser, db: DbSession) -> RouteOut:
    """Invalidate the old link/QR and issue a fresh token."""
    route = owned_route(db, route_id, user)
    route.share_token = new_share_token()
    db.commit()
    db.refresh(route)
    counts = route_counts(db, [route.id]).get(route.id, LandmarkCounts(total=0, verified=0, stale=0))
    return route_out(route, counts)


@router.get("/{route_id}/qr")
def route_qr(
    route_id: int,
    user: CurrentUser,
    db: DbSession,
    download: bool = Query(default=False),
) -> Response:
    route = owned_route(db, route_id, user)
    png = qr_png(route.share_token)
    disposition = "attachment" if download else "inline"
    return Response(
        content=png,
        media_type="image/png",
        headers={"Content-Disposition": f'{disposition}; filename="waypoint-route-{route.id}.qr.png"'},
    )


# ------------------------------------------------------------------- landmarks
@router.post(
    "/{route_id}/landmarks", response_model=LandmarkOut, status_code=status.HTTP_201_CREATED
)
def add_landmark(
    route_id: int, payload: LandmarkCreate, user: CurrentUser, db: DbSession
) -> LandmarkOut:
    route = owned_route(db, route_id, user)
    last = db.scalar(
        select(Landmark)
        .where(Landmark.route_id == route.id)
        .order_by(Landmark.position.desc())
        .limit(1)
    )
    last_verified, next_verification = freshness.initial_verification()
    landmark = Landmark(
        route_id=route.id,
        position=(last.position + 1) if last else 0,
        last_verified=last_verified,
        next_verification=next_verification,
        **payload.model_dump(),
    )
    db.add(landmark)
    route.updated_at = freshness.utcnow_naive()
    db.commit()
    db.refresh(landmark)
    return landmark_out(landmark)


@router.put("/{route_id}/landmarks/order", response_model=list[LandmarkOut])
def reorder_landmarks(
    route_id: int, payload: ReorderRequest, user: CurrentUser, db: DbSession
) -> list[LandmarkOut]:
    """Set the visiting order of the whole sequence in one call."""
    route = owned_route(db, route_id, user)
    existing = {lm.id: lm for lm in route.landmarks}
    missing = set(payload.landmark_ids) - set(existing)
    if missing:
        raise HTTPException(
            status_code=400,
            detail=f"Landmarks not part of this route: {sorted(missing)}",
        )
    if len(payload.landmark_ids) != len(existing):
        raise HTTPException(
            status_code=400,
            detail="Send every landmark id for this route, exactly once",
        )

    # Park positions in a temporary negative range first: (route_id, position)
    # is UNIQUE, so swapping two landmarks in one flush would trip the
    # constraint halfway through.
    for index, landmark_id in enumerate(payload.landmark_ids):
        existing[landmark_id].position = -(index + 1)
    db.flush()

    for index, landmark_id in enumerate(payload.landmark_ids):
        existing[landmark_id].position = index
    route.updated_at = freshness.utcnow_naive()
    db.commit()
    db.refresh(route)
    return [landmark_out(lm) for lm in route.landmarks]
