"""Verify the Vercel entry point works with Vercel's exact environment.

Simulates a cold serverless start: ephemeral /tmp paths, no STATIC_DIR, and the
API reached both with and without the /api prefix.
"""

import io
import os
import sys
import tempfile
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT))

# Mirrors vercel.json's env block. The storage root is injectable so each
# process is a genuinely separate "instance", the way a Vercel cold start is.
_TMP = Path(os.environ.get("SIM_STORAGE") or (tempfile.gettempdir() / "waypoint-vercel-sim"))
_TMP.mkdir(parents=True, exist_ok=True)
os.environ["DATABASE_URL"] = f"sqlite:///{(_TMP / 'waypoint.db').as_posix()}"
os.environ["UPLOAD_DIR"] = str(_TMP / "uploads")
os.environ["STATIC_DIR"] = ""  # must parse as None, not Path(".")
os.environ["SEED_DEMO_DATA"] = "true"
os.environ["DEMO_AUTO_LOGIN"] = "true"
os.environ["JWT_SECRET"] = "vercel-simulation-secret-long-enough-for-hs256"
os.environ["PUBLIC_BASE_URL"] = "https://waypoint-demo.vercel.app"

from fastapi.testclient import TestClient  # noqa: E402

import api.index as entry  # noqa: E402

passed, failed = 0, 0


def check(name, condition, detail=""):
    global passed, failed
    if condition:
        passed += 1
        print(f"  PASS  {name}")
    else:
        failed += 1
        print(f"  FAIL  {name}  {detail}")


print("== cold start, exactly as Vercel would ==")

# SIM_ONLY_COLD asserts a genuinely fresh instance and nothing else. It must run
# as its own process — a second TestClient block in this process would reuse the
# same engine and therefore the same database.
if os.environ.get("SIM_ONLY_COLD") == "1":
    with TestClient(entry.app) as client:
        session = client.post("/api/auth/demo")
        check("auto-login works on a virgin instance", session.status_code == 200, session.text[:120])
        if session.status_code == 200:
            h = {"Authorization": f"Bearer {session.json()['access_token']}"}
            r = client.get("/api/routes", headers=h)
            names = sorted(x["title"] for x in r.json()) if r.status_code == 200 else []
            check("exactly the 2 demo routes", names == [
                "Coaching centre -> Sir Syed University",
                "Green Shop -> Blue Water Tank",
            ], f"{names}")
            lib = client.get("/api/public-landmarks", headers=h)
            check("library re-seeded", lib.status_code == 200 and len(lib.json()) >= 3)
            stale = client.get("/api/public-landmarks?stale=true", headers=h)
            check("a landmark needs re-checking", len(stale.json()) >= 1)
    import shutil

    shutil.rmtree(_TMP, ignore_errors=True)
    print(f"\npassed={passed} failed={failed}")
    sys.exit(1 if failed else 0)

with TestClient(entry.app) as client:
    # 1. Config: empty STATIC_DIR must not shadow the API.
    from app.config import settings

    check("STATIC_DIR='' resolves to None", settings.static_dir is None, repr(settings.static_dir))
    check("upload dir created", Path(settings.upload_dir).is_dir())

    # 2. Health.
    r = client.get("/health")
    check("/health reachable", r.status_code == 200, r.text[:120])

    # 3. Auto-seed ran on boot, with no manual step.
    session = client.post("/api/auth/demo")
    check("demo auto-login works", session.status_code == 200, session.text[:120])
    token = session.json()["access_token"]
    headers = {"Authorization": f"Bearer {token}"}

    routes = client.get("/api/routes", headers=headers)
    check("two demo routes seeded", routes.status_code == 200 and len(routes.json()) == 2)

    # 4. PUBLIC_BASE_URL must be used for share links, not localhost.
    share = routes.json()[0]["share_url"]
    check("share link uses PUBLIC_BASE_URL", "vercel.app" in share, share)

    # 5. The prefix-normalising middleware: the same call without /api.
    unprefixed = client.get("/routes", headers=headers)
    check(
        "/routes (no prefix) still reaches the API",
        unprefixed.status_code == 200,
        f"got {unprefixed.status_code}",
    )

    # 6. Uploads land on the ephemeral dir and are served back.
    created = client.post(
        "/api/routes",
        headers=headers,
        json={"title": "Sim route", "destination_lat": 24.9155, "destination_lng": 67.0925},
    )
    check("create route works", created.status_code == 201, created.text[:120])
    route_id = created.json()["id"]

    landmark = client.post(
        f"/api/routes/{route_id}/landmarks",
        headers=headers,
        json={"name": "Sim Gate", "action": "pass", "lat": 24.9155, "lng": 67.0925},
    )
    check("create landmark works", landmark.status_code == 201, landmark.text[:120])

    png = bytes.fromhex(
        "89504e470d0a1a0a0000000d494844520000000100000001080600000"
        "01f15c4890000000a49444154789c6360000002000100ffff0300000600"
        "0557bfabd40000000049454e44ae426082"
    )
    photo = client.post(
        f"/api/landmarks/{landmark.json()['id']}/photo",
        headers=headers,
        files={"file": ("g.png", io.BytesIO(png), "image/png")},
    )
    check("photo upload works", photo.status_code == 200, photo.text[:120])
    url = photo.json()["photo_url"]
    check("photo served from /uploads", client.get(url).status_code == 200)

    # 7. QR code.
    qr = client.get(f"/api/routes/{route_id}/qr", headers=headers)
    check("QR is a PNG", qr.headers.get("content-type") == "image/png")

    # 8. Public share link, no account.
    public = client.get(f"/api/public/routes/{routes.json()[0]['share_token']}")
    check("public route needs no account", public.status_code == 200)

    # 9. The library.
    lib = client.get("/api/public-landmarks", headers=headers)
    check("community library seeded", lib.status_code == 200 and len(lib.json()) >= 3)

# 10. A separate cold-start process is run by the caller with SIM_ONLY_COLD=1.

import shutil

shutil.rmtree(_TMP, ignore_errors=True)
print(f"\npassed={passed} failed={failed}")
sys.exit(1 if failed else 0)
