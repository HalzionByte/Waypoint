"""Seed the demo account, two sample routes, and a small community library.

Runs on boot when the database is empty (see `Settings.seed_demo_data`) so a
fresh deploy is immediately demo-able, and can also be run by hand:

    python seed.py            # seed if empty
    python seed.py --force    # wipe demo data first
"""

from __future__ import annotations

import sys
from datetime import timedelta

from sqlalchemy import delete, select

from app.config import DEMO_EMAIL, DEMO_PASSWORD
from app.database import SessionLocal, init_db
from app.models import (
    Landmark,
    LandmarkAction,
    PublicLandmark,
    PublicLandmarkReport,
    Route,
    User,
)
from app.security import hash_password
from app.services import freshness

DEMO_ACCOUNT = DEMO_EMAIL

# ---------------------------------------------------------------------------
# Route 1 — the worked example from the PRD, with real landmark guidance.
# ---------------------------------------------------------------------------
KHI_UNIVERSITY = (24.9155118, 67.0924559)  # Sir Syed University, verified via OSM

# name, action, instruction, description, lat offset, lng offset
LANDMARKS_EXAMPLE = [
    (
        "Coaching Centre Front Gate",
        LandmarkAction.START,
        "Start from the coaching centre gate on the main road.",
        "The landmark the route is measured from.",
        0.0,
        0.0,
    ),
    (
        "Main University Road Junction",
        LandmarkAction.PASS,
        "Continue onto University Road towards Gulshan-e-Iqbal.",
        "Wide four-lane road; buses and rickshaws converge here.",
        0.0022,
        0.0015,
    ),
    (
        "Sir Syed University Outer Wall",
        LandmarkAction.CONTINUE,
        "Continue until the university wall runs along your right.",
        "Long cream boundary wall with the campus name in green.",
        0.0009,
        0.0006,
    ),
    (
        "Main Entrance",
        LandmarkAction.DESTINATION,
        "The main entrance is on your right, opposite the bus stop.",
        "Look for the gate directly across from the marked bus stop.",
        0.0,
        0.0,
    ),
]

# ---------------------------------------------------------------------------
# Route 2 — a short route, mostly to show the map + share/QR flow.
# ---------------------------------------------------------------------------
LANDMARKS_SIMPLE = [
    (
        "Green Shop",
        LandmarkAction.PASS,
        "Pass the green shop on the corner.",
        "Distinctive green frontage, easy to spot from the road.",
        0.0012,
        -0.0008,
    ),
    (
        "Blue Water Tank",
        LandmarkAction.CONTINUE,
        "Continue until the blue water tank comes into view.",
        "Large tank on a concrete platform, visible from far away.",
        0.0004,
        0.0009,
    ),
    (
        "Destination",
        LandmarkAction.DESTINATION,
        "The destination is opposite the blue water tank.",
        "Look for the marked entrance across the road.",
        0.0,
        0.0,
    ),
]

# name, description, lat offset, lng offset, days until re-check is due
# A negative value marks the landmark as already overdue, so the community
# re-check flow has something to show.
EXAMPLE_PUBLIC_LANDMARKS = [
    (
        "Green Pharmacy",
        "Green shopfront with a white cross, opposite the mosque.",
        0.0009,
        -0.0006,
        150,
    ),
    (
        "Blue Water Tank",
        "Large blue tank on a concrete platform, visible from the main road.",
        -0.0011,
        0.0007,
        12,
    ),
    (
        "Old Post Office",
        "Red-brick single-storey building with a faded Pakistan Post sign.",
        0.0016,
        0.0011,
        -20,
    ),
]


def seed_demo_data(force: bool = False) -> bool:
    """Create demo data if absent. Returns True when something was written."""
    init_db()
    now = freshness.utcnow_naive()

    with SessionLocal() as db:
        if force:
            # Order matters: children before parents.
            demo = db.scalar(select(User).where(User.email == DEMO_EMAIL))
            if demo is not None:
                db.execute(
                    delete(PublicLandmarkReport).where(
                        PublicLandmarkReport.reporter_id == demo.id
                    )
                )
                db.execute(
                    delete(PublicLandmark).where(PublicLandmark.contributor_id == demo.id)
                )
                route_ids = select(Route.id).where(Route.owner_id == demo.id)
                db.execute(delete(Landmark).where(Landmark.route_id.in_(route_ids)))
                db.execute(delete(Route).where(Route.owner_id == demo.id))
                db.execute(delete(User).where(User.id == demo.id))
                db.commit()

        if db.scalar(select(User).where(User.email == DEMO_EMAIL)) is not None:
            return False

        user = User(
            name="Demo Creator",
            email=DEMO_EMAIL,
            password_hash=hash_password(DEMO_PASSWORD),
        )
        db.add(user)
        db.flush()

        for title, name, address, steps in (
            (
                "Coaching centre -> Sir Syed University",
                "Sir Syed University of Engineering & Technology",
                "University Road, Gulshan-e-Iqbal Block 9, Karachi",
                LANDMARKS_EXAMPLE,
            ),
            (
                "Green Shop -> Blue Water Tank",
                "Blue Water Tank",
                "Gulshan-e-Iqbal, Karachi",
                LANDMARKS_SIMPLE,
            ),
        ):
            route = Route(
                owner_id=user.id,
                title=title,
                destination_name=name,
                destination_address=address,
                destination_lat=KHI_UNIVERSITY[0],
                destination_lng=KHI_UNIVERSITY[1],
            )
            db.add(route)
            db.flush()

            for index, (lm_name, action, instruction, description, dlat, dlng) in enumerate(
                steps
            ):
                db.add(
                    Landmark(
                        route_id=route.id,
                        position=index,
                        name=lm_name,
                        action=action,
                        instruction=instruction,
                        description=description,
                        lat=route.destination_lat + dlat,
                        lng=route.destination_lng + dlng,
                        last_verified=now,
                        next_verification=freshness.due_date(now),
                    )
                )

        for name, description, dlat, dlng, due_in_days in EXAMPLE_PUBLIC_LANDMARKS:
            db.add(
                PublicLandmark(
                    contributor_id=user.id,
                    name=name,
                    description=description,
                    lat=KHI_UNIVERSITY[0] + dlat,
                    lng=KHI_UNIVERSITY[1] + dlng,
                    last_verified=now,
                    # due_in_days may be negative to seed an already-overdue one.
                    next_verification=now + timedelta(days=due_in_days),
                    last_verified_by_id=user.id,
                )
            )

        db.commit()
        share = db.scalar(select(Route).where(Route.owner_id == user.id))

    print("[seed] demo data created")
    print(f"[seed]   login:  {DEMO_EMAIL} / {DEMO_PASSWORD}")
    if share is not None:
        print(f"[seed]   route:  /r/{share.share_token}")
    print("[seed]   library: /landmarks")
    return True


def main() -> None:
    force = "--force" in sys.argv
    wrote = seed_demo_data(force=force)
    if not wrote:
        print(f"[seed] demo user {DEMO_EMAIL} already exists — nothing to do.")
        print("[seed] use --force to wipe and re-create demo data.")


if __name__ == "__main__":
    main()
