"""The demo login must work on a cold instance with an empty database.

This is the exact failure being fixed: Vercel did not run the lifespan event,
so no tables and no demo account existed, and /api/auth/demo 404'd.
"""

import os
import sys
import tempfile
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT))

_TMP = Path(os.environ.get("SIM_STORAGE") or (tempfile.gettempdir() / "wp-coldstart"))
_TMP.mkdir(parents=True, exist_ok=True)
os.environ["DATABASE_URL"] = f"sqlite:///{(_TMP / 'waypoint.db').as_posix()}"
os.environ["UPLOAD_DIR"] = str(_TMP / "uploads")
os.environ["STATIC_DIR"] = ""
os.environ["SEED_DEMO_DATA"] = "true"
os.environ["DEMO_AUTO_LOGIN"] = "true"
os.environ["JWT_SECRET"] = "cold-start-simulation-secret-long-enough-x1"
os.environ["PUBLIC_BASE_URL"] = "https://waypoint-demo.vercel.app"

from fastapi.testclient import TestClient  # noqa: E402

import api.index as entry  # noqa: E402
from app.database import Base, engine  # noqa: E402

passed = failed = 0


def check(name, ok, detail=""):
    global passed, failed
    if ok:
        passed += 1
        print(f"  PASS  {name}")
    else:
        failed += 1
        print(f"  FAIL  {name}   {detail}")


# Empty database, and the lifespan event is never delivered.
Base.metadata.drop_all(bind=engine)
print("== empty database, lifespan never runs ==")

with TestClient(entry.app) as client:
    r = client.post("/api/auth/demo")
    check(
        "demo login self-seeds and returns a session",
        r.status_code == 200,
        f"got {r.status_code} {r.text[:100]}",
    )

    if r.status_code == 200:
        h = {"Authorization": f"Bearer {r.json()['access_token']}"}

        routes = client.get("/api/routes", headers=h)
        titles = [x["title"] for x in routes.json()] if routes.status_code == 200 else []
        check("two sample routes present", len(titles) == 2, f"{titles}")

        lib = client.get("/api/public-landmarks", headers=h)
        check("community library present", lib.status_code == 200 and len(lib.json()) >= 3)

        stale = client.get("/api/public-landmarks?stale=true", headers=h)
        check("a landmark needs re-checking", len(stale.json()) >= 1)

        detail = client.get("/api/routes/1", headers=h)
        check(
            "route has landmark steps",
            detail.status_code == 200 and len(detail.json()["landmarks"]) >= 3,
        )

        reg = client.post(
            "/api/auth/register",
            json={"name": "Judge", "email": "j@example.com", "password": "password123"},
        )
        check("judges can still register", reg.status_code == 201, f"got {reg.status_code}")

        share = client.get("/api/public/routes/" + routes.json()[0]["share_token"])
        check("share link opens with no account", share.status_code == 200)

    # Repeat calls must not duplicate anything.
    r2 = client.post("/api/auth/demo")
    check("repeat call still works", r2.status_code == 200, f"got {r2.status_code}")
    if r2.status_code == 200:
        h2 = {"Authorization": f"Bearer {r2.json()['access_token']}"}
        again = client.get("/api/routes", headers=h2)
        check(
            "no duplicate routes on repeat",
            len(again.json()) == 2,
            f"{len(again.json())}",
        )

import shutil

shutil.rmtree(_TMP, ignore_errors=True)
print(f"\npassed={passed} failed={failed}")
sys.exit(1 if failed else 0)
