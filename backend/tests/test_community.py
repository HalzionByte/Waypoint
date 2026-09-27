"""Community landmarks: contribute, reuse, refresh, report."""

from __future__ import annotations

import io
from datetime import datetime, timedelta

from fastapi.testclient import TestClient

from app.database import SessionLocal
from app.models import Landmark, PublicLandmark
from app.services import freshness

PNG = bytes.fromhex(
    "89504e470d0a1a0a0000000d494844520000000100000001080600000"
    "01f15c4890000000a49444154789c6360000002000100ffff0300000600"
    "0557bfabd40000000049454e44ae426082"
)


def register(client: TestClient, email: str) -> dict[str, str]:
    response = client.post(
        "/api/auth/register",
        json={"name": "User", "email": email, "password": "password123"},
    )
    assert response.status_code == 201, response.text
    return {"Authorization": f"Bearer {response.json()['access_token']}"}


def make_route(client: TestClient, auth: dict, title: str = "My route") -> dict:
    response = client.post(
        "/api/routes",
        headers=auth,
        json={
            "title": title,
            "destination_lat": 31.5204,
            "destination_lng": 74.3587,
        },
    )
    assert response.status_code == 201, response.text
    return response.json()


def contribute(
    client: TestClient,
    auth: dict,
    name: str = "Green Pharmacy",
    description: str = "Green shopfront on the corner.",
) -> dict:
    response = client.post(
        "/api/public-landmarks",
        headers=auth,
        json={"name": name, "lat": 31.5204, "lng": 74.3587, "description": description},
    )
    assert response.status_code == 201, response.text
    return response.json()


def backdate(landmark_id: int, days: int) -> None:
    with SessionLocal() as db:
        row = db.get(PublicLandmark, landmark_id)
        row.next_verification = freshness.utcnow_naive() - timedelta(days=days)
        db.commit()


# ------------------------------------------------------------------ contribute
def test_contribute_creates_a_reusable_landmark(client: TestClient, auth: dict):
    landmark = contribute(client, auth)

    assert landmark["name"] == "Green Pharmacy"
    assert landmark["is_mine"] is True
    assert landmark["can_verify"] is True
    assert landmark["is_stale"] is False
    assert landmark["times_used"] == 0
    assert landmark["next_verification"] is not None


def test_contribution_starts_a_six_month_window(client: TestClient, auth: dict):
    landmark = contribute(client, auth)
    now = freshness.utcnow_naive()
    due = datetime.fromisoformat(landmark["next_verification"]).replace(tzinfo=None)

    # Roughly six months out, matching the PRD.
    assert 170 <= (due - now).days <= 185


def test_contribute_requires_auth(client: TestClient):
    response = client.post(
        "/api/public-landmarks", json={"name": "X", "lat": 1.0, "lng": 2.0}
    )
    assert response.status_code == 401


# ------------------------------------------------------------------------ reuse
def test_any_user_can_see_and_use_a_contribution(client: TestClient, auth: dict):
    other = register(client, "bilal@example.com")
    landmark = contribute(client, auth)
    their_route = make_route(client, other)

    # Visible to another user, and flagged as not theirs.
    listed = client.get("/api/public-landmarks", headers=other).json()
    assert [item["id"] for item in listed] == [landmark["id"]]
    assert listed[0]["is_mine"] is False
    assert listed[0]["can_verify"] is False

    used = client.post(
        f"/api/public-landmarks/{landmark['id']}/use",
        headers=other,
        json={"route_id": their_route["id"]},
    )
    assert used.status_code == 201, used.text
    step = used.json()
    assert step["name"] == "Green Pharmacy"
    assert step["position"] == 0
    assert step["lat"] == 31.5204

    library = client.get("/api/public-landmarks", headers=other).json()
    assert library[0]["times_used"] == 1


def test_cannot_add_someone_elses_landmark_to_your_route(
    client: TestClient, auth: dict, route: dict
):
    """The target route must belong to the caller, not the contributor."""
    other = register(client, "bilal@example.com")
    landmark = contribute(client, auth)

    response = client.post(
        f"/api/public-landmarks/{landmark['id']}/use",
        headers=other,
        json={"route_id": route["id"]},  # route belongs to `auth`
    )
    assert response.status_code == 404


# ------------------------------------------------------------- keep it current
def test_reused_step_inherits_the_contributors_clock(client: TestClient, auth: dict):
    """A route must not get its own six months when reusing a shared landmark."""
    other = register(client, "bilal@example.com")
    landmark = contribute(client, auth)
    their_route = make_route(client, other, "Bilal's route")
    client.post(
        f"/api/public-landmarks/{landmark['id']}/use",
        headers=other,
        json={"route_id": their_route["id"]},
    )

    backdate(landmark["id"], days=5)

    detail = client.get(f"/api/routes/{their_route['id']}", headers=other).json()
    step = detail["landmarks"][0]
    assert step["is_stale"] is True

    # The contributor confirms it; every route using it becomes current again.
    verified = client.post(f"/api/public-landmarks/{landmark['id']}/verify", headers=auth)
    assert verified.status_code == 200
    assert verified.json()["is_stale"] is False

    detail = client.get(f"/api/routes/{their_route['id']}", headers=other).json()
    assert detail["landmarks"][0]["is_stale"] is False


def test_a_refresh_updates_every_route_that_reuses_the_landmark(client: TestClient, auth: dict):
    """The whole point of the feature: one refresh fixes every dependent route,
    including the photo recipients actually look at."""
    other = register(client, "bilal@example.com")
    landmark = contribute(client, auth)
    their_route = make_route(client, other, "Bilal's route")
    client.post(
        f"/api/public-landmarks/{landmark['id']}/use",
        headers=other,
        json={"route_id": their_route["id"]},
    )
    backdate(landmark["id"], days=5)
    assert client.get(f"/api/routes/{their_route['id']}", headers=other).json()["landmarks"][0][
        "is_stale"
    ] is True

    refreshed = client.post(
        f"/api/public-landmarks/{landmark['id']}/photo",
        headers=other,
        files={"file": ("new.png", io.BytesIO(PNG), "image/png")},
    )
    assert refreshed.status_code == 200, refreshed.text
    new_photo = refreshed.json()["photo_url"]

    step = client.get(f"/api/routes/{their_route['id']}", headers=other).json()["landmarks"][0]
    assert step["is_stale"] is False
    assert step["photo_url"] == new_photo
    assert step["public_landmark_id"] == landmark["id"]

    # And the recipient sees the refreshed photo, not the original copy.
    public_route = client.get(f"/api/routes/{their_route['id']}", headers=other).json()
    token = public_route["share_token"]
    viewer = client.get(f"/api/public/routes/{token}").json()
    assert viewer["landmarks"][0]["photo_url"] == new_photo
    assert viewer["landmarks"][0]["is_stale"] is False


def test_only_the_contributor_can_confirm(client: TestClient, auth: dict):
    other = register(client, "bilal@example.com")
    landmark = contribute(client, auth)

    response = client.post(f"/api/public-landmarks/{landmark['id']}/verify", headers=other)
    assert response.status_code == 403


def test_any_user_can_upload_a_fresh_photo(client: TestClient, auth: dict):
    """Re-photographing is a real observation, so anyone may do it."""
    other = register(client, "bilal@example.com")
    landmark = contribute(client, auth)
    backdate(landmark["id"], days=3)

    response = client.post(
        f"/api/public-landmarks/{landmark['id']}/photo",
        headers=other,
        files={"file": ("gate.png", io.BytesIO(PNG), "image/png")},
    )
    assert response.status_code == 200, response.text
    body = response.json()
    assert body["photo_url"].startswith("/uploads/")
    assert body["is_stale"] is False
    assert body["last_verified_by"] == "User"
    # Ownership stays with the account that contributed it.
    assert body["contributor_name"] == "Ali"
    assert body["is_mine"] is False


def test_replacing_a_photo_deletes_the_old_file(client: TestClient, auth: dict):
    landmark = contribute(client, auth)
    first = client.post(
        f"/api/public-landmarks/{landmark['id']}/photo",
        headers=auth,
        files={"file": ("a.png", io.BytesIO(PNG), "image/png")},
    ).json()["photo_url"]

    second = client.post(
        f"/api/public-landmarks/{landmark['id']}/photo",
        headers=auth,
        files={"file": ("b.png", io.BytesIO(PNG), "image/png")},
    ).json()["photo_url"]

    assert first != second
    assert client.get(first).status_code == 404
    assert client.get(second).status_code == 200


# --------------------------------------------------------------------- reports
def test_report_marks_a_landmark_outdated(client: TestClient, auth: dict):
    other = register(client, "bilal@example.com")
    landmark = contribute(client, auth)

    response = client.post(
        f"/api/public-landmarks/{landmark['id']}/report",
        headers=other,
        json={"note": "The shop is closed now."},
    )
    assert response.status_code == 200, response.text
    body = response.json()
    assert body["is_disputed"] is True
    assert body["report_count"] == 1
    assert body["reported_by_me"] is True

    # The contributor sees someone flagged it.
    seen = client.get(f"/api/public-landmarks/{landmark['id']}", headers=auth).json()
    assert seen["is_disputed"] is True
    assert seen["reported_by_me"] is False


def test_cannot_report_the_same_landmark_twice(client: TestClient, auth: dict):
    other = register(client, "bilal@example.com")
    landmark = contribute(client, auth)
    url = f"/api/public-landmarks/{landmark['id']}/report"

    assert client.post(url, headers=other, json={}).status_code == 200
    assert client.post(url, headers=other, json={}).status_code == 409


def test_contributor_refreshes_instead_of_reporting(client: TestClient, auth: dict):
    landmark = contribute(client, auth)
    response = client.post(f"/api/public-landmarks/{landmark['id']}/report", headers=auth, json={})
    assert response.status_code == 400


def test_refreshing_clears_an_outstanding_report(client: TestClient, auth: dict):
    other = register(client, "bilal@example.com")
    landmark = contribute(client, auth)
    client.post(f"/api/public-landmarks/{landmark['id']}/report", headers=other, json={})

    refreshed = client.post(
        f"/api/public-landmarks/{landmark['id']}/photo",
        headers=auth,
        files={"file": ("c.png", io.BytesIO(PNG), "image/png")},
    ).json()
    assert refreshed["is_disputed"] is False
    # The report is kept for history, only the flag is cleared.
    assert refreshed["report_count"] == 1


# -------------------------------------------------------------------- browsing
def test_stale_and_disputed_filters(client: TestClient, auth: dict):
    fresh = contribute(client, auth, name="Fresh Shop")
    stale = contribute(client, auth, name="Old Shop")
    backdate(stale["id"], days=10)

    only_stale = client.get("/api/public-landmarks?stale=true", headers=auth).json()
    assert [item["id"] for item in only_stale] == [stale["id"]]

    only_fresh = client.get("/api/public-landmarks?stale=false", headers=auth).json()
    assert [item["id"] for item in only_fresh] == [fresh["id"]]

    assert client.get("/api/public-landmarks?disputed=true", headers=auth).json() == []


def test_search_matches_name_and_description(client: TestClient, auth: dict):
    contribute(
        client, auth, name="Green Pharmacy", description="Green shopfront on the corner."
    )
    contribute(client, auth, name="Brown Gate", description="Tall brown metal gate on the left.")

    # "pharm" only appears in the first landmark's name.
    by_name = client.get("/api/public-landmarks?q=pharm", headers=auth).json()
    assert [item["name"] for item in by_name] == ["Green Pharmacy"]

    # Descriptions are searched too.
    by_text = client.get("/api/public-landmarks?q=shopfront", headers=auth).json()
    assert [item["name"] for item in by_text] == ["Green Pharmacy"]

    assert client.get("/api/public-landmarks?q=nothinghere", headers=auth).json() == []


def test_deleting_a_route_leaves_the_contribution_intact(
    client: TestClient, auth: dict, route: dict
):
    landmark = contribute(client, auth)
    client.post(
        f"/api/public-landmarks/{landmark['id']}/use",
        headers=auth,
        json={"route_id": route["id"]},
    )
    assert client.delete(f"/api/routes/{route['id']}", headers=auth).status_code == 204

    with SessionLocal() as db:
        assert db.get(PublicLandmark, landmark["id"]) is not None
        # And the step that referenced it went with the route.
        assert db.query(Landmark).filter(Landmark.public_landmark_id == landmark["id"]).count() == 0
