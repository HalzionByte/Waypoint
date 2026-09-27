"""Account creation and login for route creators (PRD section 12)."""

from __future__ import annotations

from fastapi import APIRouter, HTTPException, status
from sqlalchemy import select

from ..config import DEMO_EMAIL, settings
from ..deps import CurrentUser, DbSession
from ..models import User
from ..schemas import LoginRequest, RegisterRequest, TokenResponse, UserOut
from ..security import create_access_token, hash_password, verify_password

router = APIRouter(prefix="/auth", tags=["auth"])


@router.post("/register", response_model=TokenResponse, status_code=status.HTTP_201_CREATED)
def register(payload: RegisterRequest, db: DbSession) -> TokenResponse:
    email = payload.email.lower().strip()
    existing = db.scalar(select(User).where(User.email == email))
    if existing is not None:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT, detail="An account with this email exists"
        )

    user = User(
        name=payload.name.strip(),
        email=email,
        password_hash=hash_password(payload.password),
    )
    db.add(user)
    db.commit()
    db.refresh(user)

    return TokenResponse(access_token=create_access_token(user.id), user=UserOut.model_validate(user))


@router.post("/login", response_model=TokenResponse)
def login(payload: LoginRequest, db: DbSession) -> TokenResponse:
    user = db.scalar(select(User).where(User.email == payload.email.lower().strip()))
    if user is None or not verify_password(payload.password, user.password_hash):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED, detail="Incorrect email or password"
        )
    return TokenResponse(access_token=create_access_token(user.id), user=UserOut.model_validate(user))


@router.get("/me", response_model=UserOut)
def me(user: CurrentUser) -> User:
    return user


@router.post("/demo", response_model=TokenResponse)
def demo_login(db: DbSession) -> TokenResponse:
    """Sign in as the shared demo account without credentials.

    So a visitor lands in a working app rather than a login wall. Deliberately
    404s (rather than 403) when disabled, which the frontend treats as "no demo
    here, carry on unauthenticated".
    """
    if not settings.demo_auto_login:
        raise HTTPException(status_code=404, detail="Demo login is not available")
    user = db.scalar(select(User).where(User.email == DEMO_EMAIL))
    if user is None:
        raise HTTPException(
            status_code=404,
            detail="The demo account has not been created on this instance",
        )
    return TokenResponse(access_token=create_access_token(user.id), user=UserOut.model_validate(user))
