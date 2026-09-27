"""Test fixtures. Env vars are set before the app package is imported."""

from __future__ import annotations

import os
import tempfile
from pathlib import Path

import pytest

_TMP = Path(tempfile.mkdtemp(prefix="waypoint-test-"))

# Must happen before `app.config` is imported, since Settings is cached.
os.environ["DATABASE_URL"] = f"sqlite:///{(_TMP / 'test.db').as_posix()}"
os.environ["JWT_SECRET"] = "test-secret-that-is-at-least-32-bytes-long"
os.environ["UPLOAD_DIR"] = str(_TMP / "uploads")
os.environ["PUBLIC_BASE_URL"] = "http://testserver"
os.environ["VERIFICATION_DAYS"] = "180"
os.environ["SEED_DEMO_DATA"] = "false"

from fastapi.testclient import TestClient  # noqa: E402

from app.database import Base, engine  # noqa: E402
from app.main import app  # noqa: E402


@pytest.fixture(autouse=True)
def clean_db():
    Base.metadata.drop_all(bind=engine)
    Base.metadata.create_all(bind=engine)
    yield
    Base.metadata.drop_all(bind=engine)


@pytest.fixture
def client() -> TestClient:
    with TestClient(app) as test_client:
        yield test_client


@pytest.fixture
def seed_demo():
    """Populate the shared demo account, the way a fresh deploy does on boot."""

    def _seed() -> None:
        from seed import seed_demo_data

        seed_demo_data(force=True)

    return _seed


@pytest.fixture
def auth(client: TestClient) -> dict[str, str]:
    response = client.post(
        "/api/auth/register",
        json={"name": "Ali", "email": "ali@example.com", "password": "password123"},
    )
    assert response.status_code == 201, response.text
    return {"Authorization": f"Bearer {response.json()['access_token']}"}


@pytest.fixture
def route(client: TestClient, auth: dict[str, str]) -> dict:
    response = client.post(
        "/api/routes",
        headers=auth,
        json={
            "title": "House opposite the black gate",
            "destination_name": "Ali Residence",
            "destination_lat": 31.5204,
            "destination_lng": 74.3587,
        },
    )
    assert response.status_code == 201, response.text
    return response.json()
