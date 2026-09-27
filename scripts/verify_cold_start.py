"""Simulate the Render deployment: a cold instance, an empty database, and a
frontend on a completely different origin.

The demo login must work on a cold instance with no lifespan event (Render and
Vercel both skip it), and a split origin is where the subtle bugs live: CORS
and photo URLs that resolve against the wrong host. This exercises both.
"""

import os
import sys
import tempfile
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT / "backend"))

_TMP = Path(os.environ.get("SIM_STORAGE") or (tempfile.gettempdir() / "wp-coldstart"))
_TMP.mkdir(parents=True, exist_ok=True)

FRONTEND = "https://waypoint-demo.vercel.app"
API = "https://waypoint-api.onrender.com"

os.environ["DATABASE_URL"] = f"sqlite:///{(_TMP / 'waypoint.db').as_posix()}"
os.environ["UPLOAD_DIR"] = str(_TMP / "uploads")
os.environ["STATIC_DIR"] = ""
os.environ["SEED_DEMO_DATA"] = "true"
os.environ["DEMO_AUTO_LOGIN"] = "true"
os.environ["JWT_SECRET"] = "cold-start-simulation-secret-long-enough-x1"
os.environ["PUBLIC_BASE_URL"] = FRONTEND
os.environ["PUBLIC_API_BASE"] = API
os.environ["CORS_ORIGINS"] = FRONTEND

from fastapi.testclient import TestClient  # noqa: E402

from app.database import Base, engine  # noqa: E402
from app.main import app  # noqa: E402

passed = failed = 0
PNG = bytes.fromhex(
    "89504e470d0a1a0a0000000d4948445200000001000000010806000000"
    "1f15c4890000000a49444154789c6360000002000100ffff03000006000557bfabd4"
    "0000000049454e44ae426082"
)


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
print("== empty database, no lifespan, frontend on a different origin ==")

with TestClient(app) as client:
    # ---------------------------------------------------------- CORS
    r = client.options(
        "/api/auth/demo",
        headers={
            "Origin": FRONTEND,
            "Access-Control-Request-Method": "POST",
            "Access-Control-Request-Headers": "authorization,content-type",
        },
    )
    check(
        "preflight from the Vercel origin is allowed",
        r.status_code == 200 and r.headers.get("access-control-allow-origin") == FRONTEND,
        f"{r.status_code} {dict(r.headers)}",
    )

    r = client.options(
        "/api/routes",
        headers={"Origin": "https://evil.example", "Access-Control-Request-Method": "GET"},
    )
    check(
        "a foreign origin is refused",
        r.headers.get("access-control-allow-origin") is None,
        str(dict(r.headers)),
    )

    cfg = client.get("/health/config", headers={"Origin": FRONTEND})
    check(
        "health/config reports the caller's origin as allowed",
        cfg.status_code == 200 and cfg.json()["caller_origin_allowed"] is True,
        cfg.text[:120],
    )

    # ------------------------------------------------------ the demo itself
    r = client.post("/api/auth/demo", headers={"Origin": FRONTEND})
    check(
        "demo login self-seeds and returns a session",
        r.status_code == 200,
        f"got {r.status_code} {r.text[:120]}",
    )

    if r.status_code != 200:
        raise SystemExit(1)

    token = r.json()["access_token"]
    h = {"Authorization": f"Bearer {token}", "Origin": FRONTEND}
    check("the response carries CORS headers too", "access-control-allow-origin" in r.headers)

    routes = client.get("/api/routes", headers=h)
    titles = [x["title"] for x in routes.json()] if routes.status_code == 200 else []
    check("two sample routes present", len(titles) == 2, f"{titles}")

    detail = client.get("/api/routes/1", headers=h)
    check(
        "route has landmark steps",
        detail.status_code == 200 and len(detail.json()["landmarks"]) >= 3,
    )

    lib = client.get("/api/public-landmarks", headers=h)
    check("community library present", lib.status_code == 200 and len(lib.json()) >= 3)

    stale = client.get("/api/public-landmarks?stale=true", headers=h)
    check("a landmark needs re-checking", len(stale.json()) >= 1)

    # ------------------------------------------------------------- share
    share = routes.json()[0]
    check(
        "share link points at the frontend, not the API",
        share["share_url"].startswith(f"{FRONTEND}/r/"),
        share["share_url"],
    )
    qr = client.get(f"/api/public/routes/{share['share_token']}/qr")
    check("QR code renders", qr.status_code == 200 and qr.content[:4] == b"\x89PNG")
    opened = client.get(f"/api/public/routes/{share['share_token']}")
    check("share link opens with no account", opened.status_code == 200)

    # ------------------------------------------------------------ photos
    step_id = detail.json()["landmarks"][0]["id"]
    up = client.post(
        f"/api/landmarks/{step_id}/photo",
        headers=h,
        files={"file": ("a.png", PNG, "image/png")},
    )
    check("photo upload accepted", up.status_code == 200, up.text[:120])
    photo = up.json().get("photo_url", "")
    check(
        "uploaded photo comes back as an absolute URL on the API host",
        photo.startswith(f"{API}/uploads/"),
        photo,
    )

    fetched = client.get(photo[len(API) :] if photo.startswith(API) else photo)
    check("that URL is actually fetchable", fetched.status_code == 200)

    reread = client.get("/api/routes/1", headers=h)
    stored = [x["photo_url"] for x in reread.json()["landmarks"] if x["photo_url"]]
    check(
        "photo reads back absolute, not /uploads/...",
        bool(stored) and all(u.startswith(f"{API}/uploads/") for u in stored),
        f"{stored}",
    )

    pub = client.get("/api/public-landmarks", headers=h).json()[0]
    if pub.get("photo_url"):
        check(
            "community photo URL is absolute too",
            pub["photo_url"].startswith(f"{API}/uploads/"),
            pub["photo_url"],
        )

    # ------------------------------------------------- judges writing data
    made = client.post(
        "/api/routes",
        headers=h,
        json={
            "title": "Judge route",
            "destination_name": "Somewhere",
            "destination_address": "Karachi",
            "destination_lat": 24.9,
            "destination_lng": 67.1,
        },
    )
    check("judges can create routes", made.status_code == 201, made.text[:120])
    check(
        "a created route stays listed",
        any(x["title"] == "Judge route" for x in client.get("/api/routes", headers=h).json()),
    )

    r2 = client.post("/api/auth/demo", headers={"Origin": FRONTEND})
    check("repeat call still works", r2.status_code == 200, f"got {r2.status_code}")
    if r2.status_code == 200:
        h2 = {"Authorization": f"Bearer {r2.json()['access_token']}"}
        check(
            "no duplicate routes on repeat",
            len(client.get("/api/routes", headers=h2).json()) == 3,
            f"{len(client.get('/api/routes', headers=h2).json())}",
        )

import shutil

shutil.rmtree(_TMP, ignore_errors=True)
print(f"\npassed={passed} failed={failed}")
sys.exit(1 if failed else 0)
