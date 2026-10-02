"""End-to-end smoke test of the endpoint sequence the frontend now performs.

Mirrors src/api/client.ts call-for-call, including the multipart upload and the
anonymous public view. Run against a live API:

    .\\.venv\\Scripts\\python.exe smoke_test.py
"""

from __future__ import annotations

import io
import sys

import httpx

BASE = "http://127.0.0.1:8000/api"

passed = 0
failed: list[str] = []


def check(label: str, condition: bool, detail: str = "") -> None:
    global passed
    if condition:
        passed += 1
        print(f"  ok   {label}")
    else:
        failed.append(label)
        print(f"  FAIL {label}  {detail}")


def main() -> int:
    with httpx.Client(timeout=20.0) as c:
        print("\n[auth]")
        demo = c.post(f"{BASE}/auth/demo")
        check("POST /auth/demo -> 200", demo.status_code == 200, demo.text[:200])
        if demo.status_code != 200:
            print("\nCannot continue without a session.")
            return 1
        token = demo.json()["access_token"]
        auth = {"Authorization": f"Bearer {token}"}

        me = c.get(f"{BASE}/auth/me", headers=auth)
        check("GET /auth/me -> 200", me.status_code == 200, me.text[:200])
        check("me has an email", "@" in me.json().get("email", ""))

        no_auth = c.get(f"{BASE}/routes")
        check("GET /routes without a token -> 401", no_auth.status_code == 401, no_auth.text[:120])

        bad_token = c.get(f"{BASE}/routes", headers={"Authorization": "Bearer nonsense"})
        check("GET /routes with a bad token -> 401", bad_token.status_code == 401)

        print("\n[routes]")
        listed = c.get(f"{BASE}/routes", headers=auth)
        check("GET /routes -> 200", listed.status_code == 200, listed.text[:200])
        check("route list is a list", isinstance(listed.json(), list))

        created = c.post(
            f"{BASE}/routes",
            headers=auth,
            json={
                "title": "Smoke test route",
                "destination_name": "The brown gate",
                "destination_address": "12 Example Lane",
                "destination_lat": 6.5244,
                "destination_lng": 3.3792,
            },
        )
        check("POST /routes -> 201", created.status_code == 201, created.text[:300])
        route = created.json()
        rid = route["id"]
        check("share_url is absolute", route["share_url"].startswith("http"), route["share_url"])

        patched = c.patch(
            f"{BASE}/routes/{rid}", headers=auth, json={"title": "Smoke test route (edited)"}
        )
        check("PATCH /routes/{id} -> 200", patched.status_code == 200, patched.text[:200])
        check("title was updated", patched.json()["title"].endswith("(edited)"))

        print("\n[landmarks]")
        lm = c.post(
            f"{BASE}/routes/{rid}/landmarks",
            headers=auth,
            json={
                "name": "The repair shop",
                "action": "pass",
                "instruction": "Pass the repair shop.",
                "description": "Blue roller shutter.",
                "lat": 6.5245,
                "lng": 3.3793,
            },
        )
        check("POST landmarks -> 201", lm.status_code == 201, lm.text[:300])
        landmark = lm.json()
        lid = landmark["id"]
        check("landmark is not stale", landmark["is_stale"] is False)
        check("freshness dates are set", bool(landmark["next_verification"]))

        second = c.post(
            f"{BASE}/routes/{rid}/landmarks",
            headers=auth,
            json={"name": "The brown gate", "action": "destination", "instruction": "Stop."},
        ).json()

        photo = c.post(
            f"{BASE}/landmarks/{lid}/photo",
            headers=auth,
            files={"file": ("gate.png", io.BytesIO(_png()), "image/png")},
        )
        check("POST landmark photo -> 200", photo.status_code == 200, photo.text[:200])
        photo_url = photo.json().get("photo_url", "")
        check("photo_url is a usable path", photo_url.startswith(("http", "/uploads/")), photo_url)

        fetched = httpx.get(f"http://127.0.0.1:8000{photo_url}", timeout=10) if photo_url.startswith("/") else None
        if fetched is not None:
            check("uploaded photo is served back", fetched.status_code == 200)

        verified = c.post(f"{BASE}/landmarks/{lid}/verify", headers=auth)
        check("POST landmark verify -> 200", verified.status_code == 200, verified.text[:200])

        reordered = c.put(
            f"{BASE}/routes/{rid}/landmarks/order",
            headers=auth,
            json={"landmark_ids": [second["id"], lid]},
        )
        check("PUT landmarks/order -> 200", reordered.status_code == 200, reordered.text[:200])
        check(
            "order was applied",
            [l["id"] for l in reordered.json()] == [second["id"], lid],
            str([l["id"] for l in reordered.json()]),
        )

        bad_order = c.put(
            f"{BASE}/routes/{rid}/landmarks/order",
            headers=auth,
            json={"landmark_ids": [lid]},
        )
        check("partial reorder is rejected -> 400/422", bad_order.status_code in (400, 422))

        edited = c.patch(
            f"{BASE}/landmarks/{lid}", headers=auth, json={"name": "The repair shop (closed?)"}
        )
        check("PATCH landmark -> 200", edited.status_code == 200, edited.text[:200])

        print("\n[public view — the point of having a server]")
        public = c.get(f"{BASE}/public/routes/{route['share_token']}")
        check("GET /public/routes/{token} -> 200 with no auth", public.status_code == 200, public.text[:200])
        pub = public.json()
        check("public view has landmarks", len(pub["landmarks"]) == 2, str(len(pub["landmarks"])))
        pub_photos = [l["photo_url"] for l in pub["landmarks"] if l["photo_url"]]
        check("public view carries the photo", bool(pub_photos), "no photos in public payload")
        check("public view hides the owner", "owner_id" not in pub)
        unknown = c.get(f"{BASE}/public/routes/definitely-not-a-token")
        check("unknown token -> 404", unknown.status_code == 404, unknown.text[:120])

        rotated = c.post(f"{BASE}/routes/{rid}/share/rotate", headers=auth)
        check("POST share/rotate -> 200", rotated.status_code == 200, rotated.text[:200])
        check("token changed", rotated.json()["share_token"] != route["share_token"])
        stale_link = c.get(f"{BASE}/public/routes/{route['share_token']}")
        check("old link is dead after rotate -> 404", stale_link.status_code == 404)

        print("\n[community]")
        contributed = c.post(
            f"{BASE}/public-landmarks",
            headers=auth,
            json={
                "name": "Smoke test landmark",
                "lat": 6.525,
                "lng": 3.38,
                "description": "Yellow gate.",
            },
        )
        check("POST /public-landmarks -> 201", contributed.status_code == 201, contributed.text[:300])
        pub_lm = contributed.json()
        pid = pub_lm["id"]
        check("is_mine is true for the contributor", pub_lm["is_mine"] is True)
        check("can_verify is true for the contributor", pub_lm["can_verify"] is True)

        search = c.get(f"{BASE}/public-landmarks", headers=auth, params={"q": "Smoke"})
        check("GET /public-landmarks?q= -> 200", search.status_code == 200, search.text[:200])
        check("search finds it", any(l["id"] == pid for l in search.json()))

        stale_filter = c.get(f"{BASE}/public-landmarks", headers=auth, params={"stale": "true"})
        check("GET /public-landmarks?stale=true -> 200", stale_filter.status_code == 200)

        # The community landmark needs a photo before reuse has anything to
        # inherit, so give it one first.
        first_photo = c.post(
            f"{BASE}/public-landmarks/{pid}/photo",
            headers=auth,
            files={"file": ("gate.png", io.BytesIO(_png()), "image/png")},
        )
        check("POST community photo -> 200", first_photo.status_code == 200, first_photo.text[:200])
        original_photo_url = first_photo.json()["photo_url"]

        reused = c.post(f"{BASE}/public-landmarks/{pid}/use", headers=auth, json={"route_id": rid})
        check("POST /public-landmarks/{id}/use -> 201", reused.status_code == 201, reused.text[:300])
        reused_lm = reused.json()
        check("reused step points at the source", reused_lm["public_landmark_id"] == pid)
        check(
            "reused step inherits the contributor's photo",
            reused_lm["photo_url"] == original_photo_url,
            f"{reused_lm['photo_url']!r} != {original_photo_url!r}",
        )

        # The claim worth proving: a reused step is a *view*, not a copy. So a
        # neighbour re-photographing the landmark must change what every route
        # using it shows — without touching the route itself.
        refreshed = c.post(
            f"{BASE}/public-landmarks/{pid}/photo",
            headers=auth,
            files={"file": ("gate2.png", io.BytesIO(_png()), "image/png")},
        )
        check("POST community photo (replace) -> 200", refreshed.status_code == 200)
        new_photo_url = refreshed.json()["photo_url"]
        check("the replacement is a different file", new_photo_url != original_photo_url)

        route_after = c.get(f"{BASE}/routes/{rid}", headers=auth).json()
        step_after = next(
            l for l in route_after["landmarks"] if l["public_landmark_id"] == pid
        )
        check(
            "the route's step now shows the refreshed photo",
            step_after["photo_url"] == new_photo_url,
            f"{step_after['photo_url']!r} != {new_photo_url!r}",
        )
        reported = c.post(f"{BASE}/public-landmarks/{pid}/report", headers=auth, json={"note": "gone"})
        check("contributor cannot report their own -> 400/403", reported.status_code in (400, 403))

        print("\n[verification]")
        summary = c.get(f"{BASE}/verification/summary", headers=auth)
        check("GET /verification/summary -> 200", summary.status_code == 200, summary.text[:200])
        check("counts are numbers", isinstance(summary.json()["total_landmarks"], int))
        due = c.get(f"{BASE}/verification/due", headers=auth)
        check("GET /verification/due -> 200", due.status_code == 200, due.text[:200])

        print("\n[teardown]")
        check("DELETE landmark -> 204", c.delete(f"{BASE}/landmarks/{lid}", headers=auth).status_code == 204)
        check("DELETE route -> 204", c.delete(f"{BASE}/routes/{rid}", headers=auth).status_code == 204)
        gone = c.get(f"{BASE}/routes/{rid}", headers=auth)
        check("deleted route is gone -> 404", gone.status_code == 404)

    print(f"\n{passed} passed, {len(failed)} failed")
    if failed:
        for name in failed:
            print(f"  - {name}")
        return 1
    return 0


def _png() -> bytes:
    """The smallest valid PNG, so the upload path is genuinely exercised."""
    import base64

    return base64.b64decode(
        "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg=="
    )


if __name__ == "__main__":
    sys.exit(main())