"""Database models — mirrors the high-level data model in the PRD (section 13)."""

from __future__ import annotations

import enum
import secrets
from datetime import datetime, timezone

from sqlalchemy import (
    Boolean,
    DateTime,
    Enum,
    Float,
    ForeignKey,
    Integer,
    String,
    Text,
    UniqueConstraint,
)
from sqlalchemy.orm import Mapped, mapped_column, relationship

from .database import Base


def utcnow() -> datetime:
    return datetime.now(timezone.utc)


def new_share_token() -> str:
    """Short, unguessable token used for public route links."""
    return secrets.token_urlsafe(12)


class LandmarkAction(str, enum.Enum):
    """The 'direction/action' field from the PRD landmark data list."""

    START = "start"
    PASS = "pass"
    CONTINUE = "continue"
    TURN_LEFT = "turn_left"
    TURN_RIGHT = "turn_right"
    TURN_BACK = "turn_back"
    ENTER = "enter"
    EXIT = "exit"
    CROSS = "cross"
    DESTINATION = "destination"
    OTHER = "other"


class User(Base):
    __tablename__ = "users"

    id: Mapped[int] = mapped_column(primary_key=True)
    name: Mapped[str] = mapped_column(String(120))
    email: Mapped[str] = mapped_column(String(320), unique=True, index=True)
    password_hash: Mapped[str] = mapped_column(String(255))
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)

    routes: Mapped[list["Route"]] = relationship(
        back_populates="owner", cascade="all, delete-orphan"
    )


class Route(Base):
    __tablename__ = "routes"

    id: Mapped[int] = mapped_column(primary_key=True)
    owner_id: Mapped[int] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), index=True)

    title: Mapped[str] = mapped_column(String(160))
    destination_name: Mapped[str] = mapped_column(String(160), default="")
    destination_address: Mapped[str] = mapped_column(String(320), default="")
    destination_lat: Mapped[float] = mapped_column(Float)
    destination_lng: Mapped[float] = mapped_column(Float)

    share_token: Mapped[str] = mapped_column(
        String(64), unique=True, index=True, default=new_share_token
    )
    is_published: Mapped[bool] = mapped_column(Boolean, default=True)

    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=utcnow, onupdate=utcnow
    )

    owner: Mapped[User] = relationship(back_populates="routes")
    landmarks: Mapped[list["Landmark"]] = relationship(
        back_populates="route",
        cascade="all, delete-orphan",
        order_by="Landmark.position",
    )


class Landmark(Base):
    __tablename__ = "landmarks"
    __table_args__ = (UniqueConstraint("route_id", "position", name="uq_landmark_position"),)

    id: Mapped[int] = mapped_column(primary_key=True)
    route_id: Mapped[int] = mapped_column(ForeignKey("routes.id", ondelete="CASCADE"), index=True)

    position: Mapped[int] = mapped_column(Integer, default=0)
    name: Mapped[str] = mapped_column(String(160))
    photo_url: Mapped[str | None] = mapped_column(String(500), nullable=True)

    # Optional map position (PRD section 9).
    lat: Mapped[float | None] = mapped_column(Float, nullable=True)
    lng: Mapped[float | None] = mapped_column(Float, nullable=True)

    instruction: Mapped[str] = mapped_column(String(255), default="")
    description: Mapped[str] = mapped_column(Text, default="")
    action: Mapped[LandmarkAction] = mapped_column(
        Enum(LandmarkAction, native_enum=False, length=32), default=LandmarkAction.PASS
    )

    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)
    last_verified: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    next_verification: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True), nullable=True, index=True
    )

    # Set when this step reuses a community landmark. The six-month clock then
    # belongs to the original contributor, not to whoever added the step.
    public_landmark_id: Mapped[int | None] = mapped_column(
        ForeignKey("public_landmarks.id", ondelete="SET NULL"), nullable=True, index=True
    )

    route: Mapped[Route] = relationship(back_populates="landmarks")
    # selectin so serialising a list of landmarks costs one extra query, not one
    # per landmark.
    public_landmark: Mapped["PublicLandmark | None"] = relationship(lazy="selectin")


class PublicLandmark(Base):
    """A community landmark: contributed once, reusable by any user.

    Kept separate from `Landmark` because it is not owned by a route. Its
    six-month validation window belongs to the contributor, so routes that
    reuse it inherit the same freshness rather than starting their own clock.
    """

    __tablename__ = "public_landmarks"

    id: Mapped[int] = mapped_column(primary_key=True)
    contributor_id: Mapped[int] = mapped_column(ForeignKey("users.id"), index=True)

    name: Mapped[str] = mapped_column(String(160))
    photo_url: Mapped[str | None] = mapped_column(String(500), nullable=True)
    lat: Mapped[float] = mapped_column(Float)
    lng: Mapped[float] = mapped_column(Float)
    description: Mapped[str] = mapped_column(Text, default="")

    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)

    # Whose check-in the window is measured from. This stays the contributor;
    # `last_verified_by` records who most recently confirmed or re-photographed it.
    last_verified: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)
    next_verification: Mapped[datetime] = mapped_column(DateTime(timezone=True), index=True)
    last_verified_by_id: Mapped[int | None] = mapped_column(
        ForeignKey("users.id"), nullable=True
    )

    is_disputed: Mapped[bool] = mapped_column(Boolean, default=False)
    report_count: Mapped[int] = mapped_column(Integer, default=0)
    times_used: Mapped[int] = mapped_column(Integer, default=0)

    contributor: Mapped[User] = relationship(foreign_keys=[contributor_id])
    last_verified_by: Mapped["User | None"] = relationship(foreign_keys=[last_verified_by_id])
    reports: Mapped[list["PublicLandmarkReport"]] = relationship(
        back_populates="landmark", cascade="all, delete-orphan"
    )


class PublicLandmarkReport(Base):
    """One "this is outdated" report per user per landmark."""

    __tablename__ = "public_landmark_reports"
    __table_args__ = (
        UniqueConstraint("public_landmark_id", "reporter_id", name="uq_landmark_report"),
    )

    id: Mapped[int] = mapped_column(primary_key=True)
    public_landmark_id: Mapped[int] = mapped_column(
        ForeignKey("public_landmarks.id", ondelete="CASCADE"), index=True
    )
    reporter_id: Mapped[int] = mapped_column(ForeignKey("users.id"), index=True)
    note: Mapped[str] = mapped_column(String(320), default="")
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)

    landmark: Mapped[PublicLandmark] = relationship(back_populates="reports")
    reporter: Mapped[User] = relationship()
