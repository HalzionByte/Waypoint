"""End-to-end coverage of the MVP flows described in the PRD."""

from __future__ import annotations

import io

from fastapi.testclient import TestClient

from app.services import freshness


def add_landmark(client: TestClient, auth: dict, route_id: int, **overrides) -> dict:
    payload = {
        "name": "Brown Gate",
        "action": "continue",
        "instruction": "Continue straight until you see the brown gate.",
        "description": "Tall brown metal gate on the left.",
        "lat": 31.5208,
        "lng": 74.3584,
    }
    payload.update(overrides)
    response = client.post(f"/api/routes/{route_id}/landmarks", headers=auth, json=payload)
    assert response.status_code == 201, response.text
    return response.json()


# ----------------------------------------------------------------------- auth
def test_register_and_login(client: TestClient):
    created = client.post(
        "/api/auth/register",
        json={"name": "Ali", "email": "Ali@Example.com", "password": "password123"},
    )
    assert created.status_code == 201
    body = created.json()
    assert body["user"]["email"] == "ali@example.com"  # normalised to lowercase

    duplicate = client.post(
        "/api/auth/register",
        json={"name": "Ali", "email": "ali@example.com", "password": "password123"},
    )
    assert duplicate.status_code == 409

    logged_in = client.post(
        "/api/auth/login", json={"email": "ali@example.com", "password": "password123"}
    )
    assert logged_in.status_code == 200

    wrong = client.post(
        "/api/auth/login", json={"email": "ali@example.com", "password": "nope"}
    )
    assert wrong.status_code == 401


# ---------------------------------------------------------------- demo login
def test_demo_login_grants_a_session_without_credentials(
    client: TestClient, seed_demo: callable
):
    """A visitor must be able to use the product without typing anything."""
    seed_demo()

    response = client.post("/api/auth/demo")
    assert response.status_code == 200, response.text
    body = response.json()
    assert body["user"]["email"] == "demo@waypoint.app"

    # The returned token really works.
    me = client.get("/api/auth/me", headers={"Authorization": f"Bearer {body['access_token']}"})
    assert me.status_code == 200
    assert me.json()["email"] == "demo@waypoint.app"


def test_demo_login_seeds_itself_on_a_cold_instance(client: TestClient):
    """A serverless instance may never run the lifespan event, so the demo
    endpoint must create its own data rather than assume it exists."""
    response = client.post("/api/auth/demo")
    assert response.status_code == 200, response.text
    token = response.json()["access_token"]

    routes = client.get(
        "/api/routes", headers={"Authorization": f"Bearer {token}"}
    ).json()
    assert len(routes) == 2
    assert all(r["landmark_counts"]["total"] >= 3 for r in routes)


def test_demo_login_404s_when_turned_off(client: TestClient, monkeypatch):
    """Setting DEMO_AUTO_LOGIN=false must close the door completely."""
    from app import config
    from app.routers import auth as auth_router

    monkeypatch.setattr(
        auth_router, "settings", config.Settings(demo_auto_login=False)
    )
    assert client.post("/api/auth/demo").status_code == 404


def test_demo_login_sees_the_seeded_routes(client: TestClient, seed_demo: callable):
    seed_demo()
    token = client.post("/api/auth/demo").json()["access_token"]
    routes = client.get(
        "/api/routes", headers={"Authorization": f"Bearer {token}"}
    ).json()

    assert len(routes) == 2
    assert all(r["landmark_counts"]["total"] >= 3 for r in routes)
    assert {r["title"] for r in routes} == {
        "Coaching centre -> Sir Syed University",
        "Green Shop -> Blue Water Tank",
    }


def test_protected_routes_require_auth(client: TestClient, route: dict):
    assert client.get("/api/routes").status_code == 401
    assert client.get(f"/api/routes/{route['id']}").status_code == 401
    assert client.get("/api/auth/me").status_code == 401


# --------------------------------------------------------------------- routes
def test_landmark_counts_are_real_numbers(client: TestClient, auth: dict, route: dict):
    """Regression: sum() over a boolean expression was typed Boolean, so SQLite
    collapsed the totals to True/False and 5 verified landmarks read as 1."""
    for index in range(5):
        add_landmark(client, auth, route["id"], name=f"Landmark {index}")

    counts = client.get(f"/api/routes/{route['id']}", headers=auth).json()["landmark_counts"]
    assert counts == {"total": 5, "verified": 5, "stale": 0}
    assert all(isinstance(counts[key], int) for key in ("total", "verified", "stale"))


def test_create_and_list_route(client: TestClient, auth: dict, route: dict):
    assert route["landmark_counts"] == {"total": 0, "verified": 0, "stale": 0}
    assert route["share_token"]
    assert route["share_url"].endswith(route["share_token"])

    listed = client.get("/api/routes", headers=auth)
    assert listed.status_code == 200
    assert [r["id"] for r in listed.json()] == [route["id"]]


def test_cannot_read_someone_elses_route(client: TestClient, route: dict):
    other = client.post(
        "/api/auth/register",
        json={"name": "Bilal", "email": "bilal@example.com", "password": "password123"},
    )
    headers = {"Authorization": f"Bearer {other.json()['access_token']}"}

    # 404 (not 403) so route ids can't be probed.
    assert client.get(f"/api/routes/{route['id']}", headers=headers).status_code == 404


def test_update_and_delete_route(client: TestClient, auth: dict, route: dict):
    patched = client.patch(
        f"/api/routes/{route['id']}", headers=auth, json={"title": "Updated title"}
    )
    assert patched.status_code == 200
    assert patched.json()["title"] == "Updated title"

    assert client.delete(f"/api/routes/{route['id']}", headers=auth).status_code == 204
    assert client.get(f"/api/routes/{route['id']}", headers=auth).status_code == 404


def test_rotate_share_token_invalidates_old_link(client: TestClient, auth: dict, route: dict):
    old_token = route["share_token"]
    assert client.get(f"/api/public/routes/{old_token}").status_code == 200

    rotated = client.post(f"/api/routes/{route['id']}/share/rotate", headers=auth)
    assert rotated.status_code == 200
    new_token = rotated.json()["share_token"]
    assert new_token != old_token

    assert client.get(f"/api/public/routes/{old_token}").status_code == 404
    assert client.get(f"/api/public/routes/{new_token}").status_code == 200


# ------------------------------------------------------------------ landmarks
def test_landmarks_are_ordered_and_reorderable(client: TestClient, auth: dict, route: dict):
    first = add_landmark(client, auth, route["id"], name="Samsung Repair Store", action="pass")
    second = add_landmark(client, auth, route["id"], name="Black Gate", action="destination")
    assert (first["position"], second["position"]) == (0, 1)

    detail = client.get(f"/api/routes/{route['id']}", headers=auth).json()
    assert [lm["name"] for lm in detail["landmarks"]] == [
        "Samsung Repair Store",
        "Black Gate",
    ]

    reordered = client.put(
        f"/api/routes/{route['id']}/landmarks/order",
        headers=auth,
        json={"landmark_ids": [second["id"], first["id"]]},
    )
    assert reordered.status_code == 200
    assert [lm["name"] for lm in reordered.json()] == ["Black Gate", "Samsung Repair Store"]
    assert [lm["position"] for lm in reordered.json()] == [0, 1]


def test_reorder_rejects_partial_or_foreign_ids(client: TestClient, auth: dict, route: dict):
    first = add_landmark(client, auth, route["id"])
    second = add_landmark(client, auth, route["id"], name="Black Gate")

    partial = client.put(
        f"/api/routes/{route['id']}/landmarks/order",
        headers=auth,
        json={"landmark_ids": [first["id"]]},
    )
    assert partial.status_code == 400

    other_route = client.post(
        "/api/routes",
        headers=auth,
        json={"title": "Other", "destination_lat": 1.0, "destination_lng": 2.0},
    ).json()
    foreign = add_landmark(client, auth, other_route["id"])

    mismatch = client.put(
        f"/api/routes/{route['id']}/landmarks/order",
        headers=auth,
        json={"landmark_ids": [first["id"], second["id"], foreign["id"]]},
    )
    assert mismatch.status_code == 400


def test_update_landmark_resets_verification_clock(client: TestClient, auth: dict, route: dict):
    landmark = add_landmark(client, auth, route["id"])
    assert landmark["is_stale"] is False

    # Backdate the last check-in past the six-month window.
    from datetime import timedelta

    from app.database import SessionLocal
    from app.models import Landmark

    with SessionLocal() as db:
        row = db.get(Landmark, landmark["id"])
        row.next_verification = freshness.utcnow_naive() - timedelta(days=1)
        db.commit()

    detail = client.get(f"/api/routes/{route['id']}", headers=auth).json()
    assert detail["landmarks"][0]["is_stale"] is True
    assert detail["landmark_counts"]["stale"] == 1

    verified = client.post(f"/api/landmarks/{landmark['id']}/verify", headers=auth)
    assert verified.status_code == 200
    assert verified.json()["is_stale"] is False


def test_delete_landmark_compacts_positions(client: TestClient, auth: dict, route: dict):
    first = add_landmark(client, auth, route["id"], name="A")
    second = add_landmark(client, auth, route["id"], name="B")
    third = add_landmark(client, auth, route["id"], name="C")

    assert client.delete(f"/api/landmarks/{second['id']}", headers=auth).status_code == 204

    landmarks = client.get(f"/api/routes/{route['id']}", headers=auth).json()["landmarks"]
    assert [lm["name"] for lm in landmarks] == ["A", "C"]
    assert [lm["position"] for lm in landmarks] == [0, 1]


# ---------------------------------------------------------------------- photos
def test_photo_upload_sets_url_and_refreshes_verification(client: TestClient, auth: dict, route: dict):
    landmark = add_landmark(client, auth, route["id"])
    assert landmark["photo_url"] is None

    # Minimal valid PNG.
    png = bytes.fromhex(
        "89504e470d0a1a0a0000000d494844520000000100000001080600000"
        "01f15c4890000000a49444154789c6360000002000100ffff0300000600"
        "0557bfabd40000000049454e44ae426082"
    )
    response = client.post(
        f"/api/landmarks/{landmark['id']}/photo",
        headers=auth,
        files={"file": ("gate.png", io.BytesIO(png), "image/png")},
    )
    assert response.status_code == 200, response.text
    photo_url = response.json()["photo_url"]
    assert photo_url.startswith("/uploads/")

    assert client.get(photo_url).status_code == 200
    detail = client.get(f"/api/routes/{route['id']}", headers=auth).json()
    assert detail["landmarks"][0]["photo_url"] == photo_url


def test_photo_upload_rejects_non_images(client: TestClient, auth: dict, route: dict):
    landmark = add_landmark(client, auth, route["id"])
    response = client.post(
        f"/api/landmarks/{landmark['id']}/photo",
        headers=auth,
        files={"file": ("payload.exe", io.BytesIO(b"MZ..."), "application/x-msdownload")},
    )
    assert response.status_code == 415


def test_deleting_a_landmark_also_removes_its_photo(client: TestClient, auth: dict, route: dict):
    """Otherwise every deleted landmark leaks a file in the upload directory."""
    png = bytes.fromhex(
        "89504e470d0a1a0a0000000d494844520000000100000001080600000"
        "01f15c4890000000a49444154789c6360000002000100ffff0300000600"
        "0557bfabd40000000049454e44ae426082"
    )
    landmark = add_landmark(client, auth, route["id"])

    uploaded = client.post(
        f"/api/landmarks/{landmark['id']}/photo",
        headers=auth,
        files={"file": ("gate.png", io.BytesIO(png), "image/png")},
    )
    photo_url = uploaded.json()["photo_url"]
    assert client.get(photo_url).status_code == 200

    assert client.delete(f"/api/landmarks/{landmark['id']}", headers=auth).status_code == 204
    assert client.get(photo_url).status_code == 404


# ------------------------------------------------------------------------ QR
def test_qr_code_is_a_png(client: TestClient, auth: dict, route: dict):
    response = client.get(f"/api/routes/{route['id']}/qr", headers=auth)
    assert response.status_code == 200
    assert response.headers["content-type"] == "image/png"
    assert response.content[:8] == b"\x89PNG\r\n\x1a\n"


def test_public_qr_needs_no_auth_and_supports_download(client: TestClient, route: dict):
    """The share page renders the QR in an <img>, which cannot send a bearer token."""
    token = route["share_token"]

    inline = client.get(f"/api/public/routes/{token}/qr")
    assert inline.status_code == 200
    assert inline.content[:8] == b"\x89PNG\r\n\x1a\n"
    assert "inline" in inline.headers["content-disposition"]

    download = client.get(f"/api/public/routes/{token}/qr?download=true")
    assert download.status_code == 200
    assert "attachment" in download.headers["content-disposition"]

    assert client.get("/api/public/routes/not-a-token/qr").status_code == 404


# --------------------------------------------------------------------- public
def test_public_view_needs_no_account(client: TestClient, auth: dict, route: dict):
    token = route["share_token"]
    add_landmark(client, auth, route["id"])

    response = client.get(f"/api/public/routes/{token}")
    assert response.status_code == 200
    body = response.json()
    assert body["title"] == "House opposite the black gate"
    assert len(body["landmarks"]) == 1
    # No owner details leak to recipients.
    assert "owner_id" not in body
    assert "share_token" not in body


def test_public_view_rejects_unknown_token(client: TestClient):
    assert client.get("/api/public/routes/does-not-exist").status_code == 404


def test_unpublished_route_is_hidden_from_public(client: TestClient, auth: dict, route: dict):
    token = route["share_token"]
    assert (
        client.patch(
            f"/api/routes/{route['id']}", headers=auth, json={"is_published": False}
        ).status_code
        == 200
    )
    assert client.get(f"/api/public/routes/{token}").status_code == 404


# -------------------------------------------------------------- verification
def test_verification_summary_and_due_list(client: TestClient, auth: dict, route: dict):
    fresh = add_landmark(client, auth, route["id"], name="Fresh")

    summary = client.get("/api/verification/summary", headers=auth).json()
    assert summary == {
        "total_routes": 1,
        "total_landmarks": 1,
        "verified": 1,
        "due_soon": 0,
        "overdue": 0,
    }
    assert client.get("/api/verification/due", headers=auth).json() == []

    from datetime import timedelta

    from app.database import SessionLocal
    from app.models import Landmark

    with SessionLocal() as db:
        row = db.get(Landmark, fresh["id"])
        row.next_verification = freshness.utcnow_naive() - timedelta(days=10)
        db.commit()

    summary = client.get("/api/verification/summary", headers=auth).json()
    assert summary["overdue"] == 1
    assert summary["verified"] == 0

    due = client.get("/api/verification/due", headers=auth).json()
    assert len(due) == 1
    assert due[0]["status"] == "overdue"
    assert due[0]["route_title"] == "House opposite the black gate"
    assert due[0]["days_until_due"] < 0
