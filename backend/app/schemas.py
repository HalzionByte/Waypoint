"""Pydantic request/response schemas."""

from __future__ import annotations

from datetime import datetime

from pydantic import BaseModel, ConfigDict, EmailStr, Field, field_validator

from .models import LandmarkAction


class ORMModel(BaseModel):
    model_config = ConfigDict(from_attributes=True)


# --------------------------------------------------------------------------- auth
class RegisterRequest(BaseModel):
    name: str = Field(min_length=1, max_length=120)
    email: EmailStr
    password: str = Field(min_length=8, max_length=128)


class LoginRequest(BaseModel):
    email: EmailStr
    password: str


class UserOut(ORMModel):
    id: int
    name: str
    email: EmailStr
    created_at: datetime


class TokenResponse(BaseModel):
    access_token: str
    token_type: str = "bearer"
    user: UserOut


# ----------------------------------------------------------------------- landmark
class LandmarkBase(BaseModel):
    name: str = Field(min_length=1, max_length=160)
    photo_url: str | None = Field(default=None, max_length=500)
    lat: float | None = Field(default=None, ge=-90, le=90)
    lng: float | None = Field(default=None, ge=-180, le=180)
    instruction: str = Field(default="", max_length=255)
    description: str = ""
    action: LandmarkAction = LandmarkAction.PASS


class LandmarkCreate(LandmarkBase):
    pass


class LandmarkUpdate(BaseModel):
    name: str | None = Field(default=None, min_length=1, max_length=160)
    photo_url: str | None = Field(default=None, max_length=500)
    lat: float | None = Field(default=None, ge=-90, le=90)
    lng: float | None = Field(default=None, ge=-180, le=180)
    instruction: str | None = Field(default=None, max_length=255)
    description: str | None = None
    action: LandmarkAction | None = None


class LandmarkOut(LandmarkBase, ORMModel):
    id: int
    route_id: int
    position: int
    created_at: datetime
    last_verified: datetime | None
    next_verification: datetime | None
    is_stale: bool = False
    #: Set when this step reuses a community landmark; its photo, position and
    #: freshness then come from that landmark rather than from this row.
    public_landmark_id: int | None = None


class ReorderRequest(BaseModel):
    landmark_ids: list[int] = Field(min_length=1)

    @field_validator("landmark_ids")
    @classmethod
    def _unique(cls, v: list[int]) -> list[int]:
        if len(set(v)) != len(v):
            raise ValueError("landmark_ids must not contain duplicates")
        return v


# --------------------------------------------------------------------------- route
class RouteBase(BaseModel):
    title: str = Field(min_length=1, max_length=160)
    destination_name: str = Field(default="", max_length=160)
    destination_address: str = Field(default="", max_length=320)
    destination_lat: float = Field(ge=-90, le=90)
    destination_lng: float = Field(ge=-180, le=180)


class RouteCreate(RouteBase):
    pass


class RouteUpdate(BaseModel):
    title: str | None = Field(default=None, min_length=1, max_length=160)
    destination_name: str | None = Field(default=None, max_length=160)
    destination_address: str | None = Field(default=None, max_length=320)
    destination_lat: float | None = Field(default=None, ge=-90, le=90)
    destination_lng: float | None = Field(default=None, ge=-180, le=180)
    is_published: bool | None = None


class LandmarkCounts(BaseModel):
    total: int
    verified: int
    stale: int


class RouteOut(ORMModel):
    id: int
    owner_id: int
    title: str
    destination_name: str
    destination_address: str
    destination_lat: float
    destination_lng: float
    share_token: str
    share_url: str
    is_published: bool
    created_at: datetime
    updated_at: datetime
    landmark_counts: LandmarkCounts


class RouteDetail(RouteOut):
    landmarks: list[LandmarkOut]


# ------------------------------------------------------------------------- public
class PublicRouteOut(BaseModel):
    """What a link/QR recipient sees. Deliberately omits owner identity."""

    title: str
    destination_name: str
    destination_address: str
    destination_lat: float
    destination_lng: float
    share_url: str
    last_updated: datetime
    landmarks: list[LandmarkOut]


# -------------------------------------------------------------------- verification
class VerificationSummary(BaseModel):
    total_routes: int
    total_landmarks: int
    verified: int
    due_soon: int
    overdue: int


class DueLandmarkOut(LandmarkOut):
    route_id: int
    route_title: str
    days_until_due: int | None
    status: str  # verified | due_soon | overdue


class PhotoUploadOut(BaseModel):
    photo_url: str


# -------------------------------------------------------------------- community
class PublicLandmarkCreate(BaseModel):
    name: str = Field(min_length=1, max_length=160)
    lat: float = Field(ge=-90, le=90)
    lng: float = Field(ge=-180, le=180)
    description: str = ""


class PublicLandmarkUpdate(BaseModel):
    name: str | None = Field(default=None, min_length=1, max_length=160)
    description: str | None = None
    lat: float | None = Field(default=None, ge=-90, le=90)
    lng: float | None = Field(default=None, ge=-180, le=180)


class PublicLandmarkOut(BaseModel):
    id: int
    name: str
    photo_url: str | None
    lat: float
    lng: float
    description: str

    contributor_id: int
    contributor_name: str
    last_verified_by: str | None

    created_at: datetime
    last_verified: datetime | None
    next_verification: datetime | None
    is_stale: bool

    is_disputed: bool
    report_count: int
    times_used: int

    # What the signed-in user is allowed to do with this one.
    is_mine: bool
    can_verify: bool
    reported_by_me: bool


class UseInRouteRequest(BaseModel):
    route_id: int


class ReportRequest(BaseModel):
    note: str = Field(default="", max_length=320)
