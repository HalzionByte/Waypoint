"""Token-based public access for route recipients (no account required)."""

from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException, Query, Response, status
from sqlalchemy import select
from sqlalchemy.orm import Session, selectinload

from ..database import get_db
from ..models import Route
from ..schemas import PublicRouteOut
from ..serializers import landmark_out
from ..services.qr import qr_png, share_url

router = APIRouter(prefix="/public", tags=["public"])


def _route_by_token(db: Session, token: str) -> Route:
    route = db.scalar(
        select(Route)
        .options(selectinload(Route.landmarks))
        .where(Route.share_token == token)
    )
    if route is None or not route.is_published:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="This route link is invalid or has been turned off",
        )
    return route


@router.get("/routes/{token}", response_model=PublicRouteOut)
def view_route(token: str, db: Session = Depends(get_db)) -> PublicRouteOut:
    route = _route_by_token(db, token)
    return PublicRouteOut(
        title=route.title,
        destination_name=route.destination_name,
        destination_address=route.destination_address,
        destination_lat=route.destination_lat,
        destination_lng=route.destination_lng,
        share_url=share_url(route.share_token),
        last_updated=route.updated_at,
        landmarks=[landmark_out(lm) for lm in route.landmarks],
    )


@router.get("/routes/{token}/qr")
def view_route_qr(
    token: str,
    db: Session = Depends(get_db),
    download: bool = Query(default=False),
) -> Response:
    """Anyone holding the link can also show/print its QR code.

    This token-scoped variant is what the frontend uses in an <img> tag, since
    a plain image request cannot carry an Authorization header.
    """
    route = _route_by_token(db, token)
    disposition = "attachment" if download else "inline"
    return Response(
        content=qr_png(route.share_token),
        media_type="image/png",
        headers={"Content-Disposition": f'{disposition}; filename="waypoint-route.qr.png"'},
    )
