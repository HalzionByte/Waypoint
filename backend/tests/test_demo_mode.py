"""Demo mode: a visitor must land in a working app, not a login wall.

Simulates the real boot order (seed, then auto-login) the way a judge
experiences it.
"""

from __future__ import annotations

import pytest
from fastapi.testclient import TestClient


def test_judge_can_use_the_product_with_zero_clicks(
    client: TestClient, seed_demo: callable
):
    seed_demo()

    # 1. The site loads.
    landing = client.get("/health")
    assert landing.status_code == 200

    # 2. No credentials are typed. One call signs them in.
    session = client.post("/api/auth/demo")
    assert session.status_code == 200
    token = session.json()["access_token"]
    headers = {"Authorization": f"Bearer {token}"}

    # 3. The two prebuilt routes are waiting.
    routes = client.get("/api/routes", headers=headers).json()
    assert len(routes) == 2

    # 4. The community library has content to browse.
    library = client.get("/api/public-landmarks", headers=headers).json()
    assert len(library) >= 3
    # ...including one that needs re-checking, so the freshness story is visible.
    assert any(item["is_stale"] for item in library)

    # 5. A share link opens with no account at all.
    share_url = routes[0]["share_url"]
    token_part = share_url.rsplit("/", 1)[-1]
    public = client.get(f"/api/public/routes/{token_part}")
    assert public.status_code == 200
    assert public.json()["landmarks"]

    # 6. And the judge can genuinely create something of their own.
    created = client.post(
        "/api/routes",
        headers=headers,
        json={
            "title": "Judge route",
            "destination_lat": 24.9155,
            "destination_lng": 67.0925,
        },
    )
    assert created.status_code == 201


def test_demo_login_is_repeatable(client: TestClient, seed_demo: callable):
    """Several judges arriving in a row must all get a working session."""
    seed_demo()
    for _ in range(3):
        response = client.post("/api/auth/demo")
        assert response.status_code == 200
        token = response.json()["access_token"]
        me = client.get(
            "/api/auth/me", headers={"Authorization": f"Bearer {token}"}
        )
        assert me.status_code == 200


def test_demo_login_can_be_switched_off(client: TestClient, seed_demo, monkeypatch):
    """A real deployment must be able to close this door.

    The demo endpoint self-seeds by default, so without the kill switch the
    shared account could never be turned off.
    """
    from app import config
    from app.routers import auth as auth_router

    seed_demo()
    # The endpoint reads the flag from its own module's settings reference.
    monkeypatch.setattr(
        auth_router, "settings", config.Settings(demo_auto_login=False)
    )
    assert client.post("/api/auth/demo").status_code == 404


def test_ordinary_login_still_works_for_a_real_account(client: TestClient, auth: dict):
    """Auto-login must not replace normal registration and sign-in."""
    me = client.get("/api/auth/me", headers=auth)
    assert me.status_code == 200
    assert me.json()["email"] == "ali@example.com"


def test_health_is_reachable_without_a_session(client: TestClient):
    assert client.get("/api/auth/me").status_code == 401
    assert client.get("/health").status_code == 200
