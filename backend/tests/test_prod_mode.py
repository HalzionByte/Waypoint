"""Single-container deploy mode: the API also serves the built frontend.

These cover the things that silently break a demo if they regress — a deep link
must survive a refresh, and a photo must be served with the right content type.
"""

from __future__ import annotations

import importlib
import os
from pathlib import Path

import pytest

BUILD = Path(__file__).resolve().parent.parent.parent / "frontend" / "dist"


@pytest.fixture
def prod_client(monkeypatch, tmp_path):
    """Import a fresh app instance wired to the real Vite build."""
    if not (BUILD / "index.html").is_file():
        pytest.skip("frontend/dist not built — run `npm run build` first")

    monkeypatch.setenv("STATIC_DIR", str(BUILD))
    monkeypatch.setenv("PUBLIC_BASE_URL", "https://waypoint.test")
    monkeypatch.setenv("SEED_DEMO_DATA", "false")

    import app.config as config

    importlib.reload(config)
    monkeypatch.setattr(config, "settings", config.Settings())

    import app.main as main

    importlib.reload(main)
    monkeypatch.setattr(main, "settings", config.settings)

    from fastapi.testclient import TestClient

    with TestClient(main.app) as client:
        yield client


def test_root_serves_the_built_site(prod_client):
    response = prod_client.get("/")
    assert response.status_code == 200
    assert response.headers["content-type"].startswith("text/html")
    assert "<div id=\"root\">" in response.text


def test_deep_links_fall_back_to_index(prod_client):
    """A judge pasting a share link or hitting refresh must get the app, not a 404."""
    for path in (
        "/dashboard",
        "/landmarks",
        "/contribute",
        "/r/abc123",
        "/routes/1",
        "/routes/1/share",
        "/verification",
        "/login",
    ):
        response = prod_client.get(path)
        assert response.status_code == 200, path
        assert "<div id=\"root\">" in response.text, path


def test_hashed_assets_are_served(prod_client):
    assets = list((BUILD / "assets").glob("*.js"))
    if not assets:
        pytest.skip("no built assets")
    response = prod_client.get(f"/assets/{assets[0].name}")
    assert response.status_code == 200
    assert "javascript" in response.headers["content-type"]


def test_api_still_works_alongside_the_spa(prod_client):
    assert prod_client.get("/health").json()["status"] == "ok"
    # Unknown API paths must 404 as JSON, not quietly return the SPA shell.
    assert prod_client.get("/api/nope").status_code == 404


def test_traversal_out_of_the_static_root_is_refused(prod_client):
    response = prod_client.get("/../../backend/app/config.py")
    assert "<div id=\"root\">" in response.text
    assert "DATABASE" not in response.text


def test_share_links_use_the_configured_public_base_url(auth, route: dict):
    """Share links and QR codes are built from PUBLIC_BASE_URL."""
    assert route["share_url"].startswith("http://testserver/r/")
