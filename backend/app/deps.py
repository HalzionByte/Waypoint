"""Shared FastAPI dependencies: current user resolution and ownership checks."""

from __future__ import annotations

from typing import Annotated

from fastapi import Depends, HTTPException, status
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from sqlalchemy.orm import Session

from .database import get_db
from .models import Landmark, Route, User
from .security import decode_access_token

bearer_scheme = HTTPBearer(auto_error=False)

DbSession = Annotated[Session, Depends(get_db)]
Creds = Annotated[HTTPAuthorizationCredentials | None, Depends(bearer_scheme)]


def get_current_user(db: DbSession, creds: Creds) -> User:
    if creds is None:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Not authenticated",
            headers={"WWW-Authenticate": "Bearer"},
        )
    user_id = decode_access_token(creds.credentials)
    if user_id is None:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid or expired token",
            headers={"WWW-Authenticate": "Bearer"},
        )
    user = db.get(User, user_id)
    if user is None:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED, detail="User no longer exists"
        )
    return user


CurrentUser = Annotated[User, Depends(get_current_user)]


def owned_route(db: Session, route_id: int, user: User) -> Route:
    route = db.get(Route, route_id)
    if route is None:
        raise HTTPException(status_code=404, detail="Route not found")
    if route.owner_id != user.id:
        # 404 rather than 403 so route ids can't be probed.
        raise HTTPException(status_code=404, detail="Route not found")
    return route


def owned_landmark(db: Session, landmark_id: int, user: User) -> Landmark:
    landmark = db.get(Landmark, landmark_id)
    if landmark is None:
        raise HTTPException(status_code=404, detail="Landmark not found")
    route = db.get(Route, landmark.route_id)
    if route is None or route.owner_id != user.id:
        raise HTTPException(status_code=404, detail="Landmark not found")
    return landmark
