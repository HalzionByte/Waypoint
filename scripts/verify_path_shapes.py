"""Verify the Vercel function handles every path shape Vercel may hand it.

Vercel's route configuration has delivered the API path as /api/routes, as
/routes, and (worst case) as a bare /api with the sub-path dropped. All three
must resolve, so the entry point normalises rather than assumes.
"""

import os
import sys
import tempfile
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT))

_TMP = Path(os.environ.get("SIM_STORAGE") or (tempfile.gettempdir() / "wp-pathsim"))
_TMP.mkdir(parents=True, exist_ok=True)
os.environ["DATABASE_URL"] = f"sqlite:///{(_TMP / 'waypoint.db').as_posix()}"
os.environ["UPLOAD_DIR"] = str(_TMP / "uploads")
os.environ["STATIC_DIR"] = ""
os.environ["SEED_DEMO_DATA"] = "true"
os.environ["DEMO_AUTO_LOGIN"] = "true"
os.environ["JWT_SECRET"] = "path-shape-simulation-secret-long-enough-x1"
os.environ["PUBLIC_BASE_URL"] = "https://waypoint-demo.vercel.app"

from fastapi.testclient import TestClient  # noqa: E402

import api.index as entry  # noqa: E402

passed = failed = 0


def check(name, ok, detail=""):
    global passed, failed
    if ok:
        passed += 1
        print(f"  PASS  {name}")
    else:
        failed += 1
        print(f"  FAIL  {name}   {detail}")


CASES = [
    ("/api/auth/demo", "with the /api prefix"),
    ("/auth/demo", "without the /api prefix"),
    ("/api/api/auth/demo", "with a doubled prefix"),
]

with TestClient(entry.app) as client:
    for path, label in CASES:
        r = client.post(path)
        check(f"POST {path}  ({label})", r.status_code == 200, f"got {r.status_code}")

    token = client.post("/api/auth/demo").json()["access_token"]
    h = {"Authorization": f"Bearer {token}"}

    r = client.get("/api/routes", headers=h)
    check("GET /api/routes", r.status_code == 200 and len(r.json()) == 2, f"got {r.status_code}")

    r = client.get("/routes", headers=h)
    check("GET /routes (unprefixed)", r.status_code == 200, f"got {r.status_code}")

    r = client.get("/health")
    check("GET /health is not prefixed", r.status_code == 200, f"got {r.status_code}")

    r = client.get("/uploads/does-not-exist.jpg")
    check("GET /uploads is not prefixed", r.status_code == 404, f"got {r.status_code}")

    # Worst case: Vercel drops the sub-path entirely. We cannot recover it, but
    # we must fail with a message that says so rather than a bare 404.
    r = client.get("/api")
    check("bare /api explains itself", r.status_code == 500 and "sub-path" in r.text, f"got {r.status_code}")

    r = client.post(
        "/api/auth/register",
        json={"name": "Judge", "email": "judge@example.com", "password": "password123"},
    )
    check("register works", r.status_code == 201, f"got {r.status_code} {r.text[:80]}")

    r = client.post(
        "/auth/register",
        json={"name": "Judge2", "email": "judge2@example.com", "password": "password123"},
    )
    check("register works unprefixed too", r.status_code == 201, f"got {r.status_code}")

import shutil

shutil.rmtree(_TMP, ignore_errors=True)
print(f"\npassed={passed} failed={failed}")
sys.exit(1 if failed else 0)
