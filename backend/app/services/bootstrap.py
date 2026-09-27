"""Self-contained demo bootstrap.

Deliberately does NOT depend on the ASGI lifespan event or on importing
seed.py: serverless platforms do not reliably run lifespan, and seed.py lives
outside the app package, so its import is not guaranteed to be bundled. This
module creates everything the demo needs inline, is safe to call from any
request, and is a no-op once the data exists.
"""

from __future__ import annotations

import logging
from datetime import timedelta

from sqlalchemy import select
from sqlalchemy.exc import SQLAlchemyError

from ..config import DEMO_EMAIL, DEMO_PASSWORD
from ..database import Base, SessionLocal, engine
from ..models import (
    Landmark,
    LandmarkAction,
    PublicLandmark,
    Route,
    User,
)
from ..security import hash_password
from ..services.freshness import due_date, utcnow_naive

log = logging.getLogger("waypoint.bootstrap")

KHI = (24.9155118, 67.0924559)  # Sir Syed University

_STEPS_EXAMPLE = [
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

_STEPS_SIMPLE = [
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

_LIBRARY = [
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

_done = False


def ensure_demo_data() -> bool:
    """Create the schema and demo content if missing. Never raises.

    Returns True when the demo account exists afterwards.
    """
    global _done

    if _done:
        return True

    try:
        with SessionLocal() as db:
            user = db.scalar(select(User).where(User.email == DEMO_EMAIL))
            if user is not None:
                _done = True
                return True

        # Tables may not exist yet on a fresh serverless instance.
        Base.metadata.create_all(bind=engine)
        _populate()
        _done = True
        return True
    except SQLAlchemyError:
        log.exception("bootstrap failed: database error")
        return False
    except Exception:  # noqa: BLE001
        log.exception("bootstrap failed")
        return False


def _populate() -> None:
    """Insert the demo account, two routes, and a small community library."""
    now = utcnow_naive()

    with SessionLocal() as db:
        if db.scalar(select(User.id).where(User.email == DEMO_EMAIL)) is not None:
            return  # another request won the race

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
                _STEPS_EXAMPLE,
            ),
            (
                "Green Shop -> Blue Water Tank",
                "Blue Water Tank",
                "Gulshan-e-Iqbal, Karachi",
                _STEPS_SIMPLE,
            ),
        ):
            route = Route(
                owner_id=user.id,
                title=title,
                destination_name=name,
                destination_address=address,
                destination_lat=KHI[0],
                destination_lng=KHI[1],
            )
            db.add(route)
            db.flush()

            for index, (step_name, action, instruction, description, dlat, dlng) in enumerate(
                steps
            ):
                db.add(
                    Landmark(
                        route_id=route.id,
                        position=index,
                        name=step_name,
                        action=action,
                        instruction=instruction,
                        description=description,
                        lat=route.destination_lat + dlat,
                        lng=route.destination_lng + dlng,
                        last_verified=now,
                        next_verification=due_date(now),
                    )
                )

        for name, description, dlat, dlng, due_in_days in _LIBRARY:
            db.add(
                PublicLandmark(
                    contributor_id=user.id,
                    name=name,
                    description=description,
                    lat=KHI[0] + dlat,
                    lng=KHI[1] + dlng,
                    last_verified=now,
                    next_verification=now + timedelta(days=due_in_days),
                    last_verified_by_id=user.id,
                )
            )

        db.commit()
        log.info("bootstrap: demo account and sample routes created")
