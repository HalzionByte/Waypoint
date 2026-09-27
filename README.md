# WayPoint

**Maps get you to the area. WayPoint gets you to the door.**

WayPoint is a visual last-mile navigation layer built from local landmarks, photos, and short
instructions — the "go past the Samsung repair shop, continue until the brown gate, turn left,
stop opposite the black gate" way of describing a place.

A creator pins a destination, builds an ordered sequence of landmarks, uploads a photo and a one
line instruction for each, then shares the route as a link or a QR code. Recipients need no
account: they open the link, walk the final few hundred metres, and tick off each landmark as they
match it against the photo.

Built from `LandmarkX_PRD.docx`.

---

## Quick start

Two terminals. Backend first.

**1. Backend** (http://127.0.0.1:8000)

The database seeds itself on first boot, so there is no separate setup step — start the backend and
a demo account with two sample routes is already there.

**Demo mode (on by default):** a visitor with no session is signed into the demo account
automatically, so nobody hits a login wall. The nav shows a `DEMO` badge and a banner explains that
anything they create is shared. Logging out sticks for the rest of that browser tab, and registering
a real account works exactly as normal. Turn it off with `DEMO_AUTO_LOGIN=false`.

```powershell
cd backend
python -m venv .venv
.\.venv\Scripts\python.exe -m pip install -r requirements.txt
.\.venv\Scripts\python.exe -m uvicorn app.main:app --reload --port 8000
```

**2. Frontend** (http://localhost:5173)

```powershell
cd frontend
npm install
npm run dev
```

Open http://localhost:5173. Interactive API docs: http://127.0.0.1:8000/docs

---

## Deploying

One container serves the API **and** the built frontend, so there is a single URL and no CORS to
configure. SQLite and landmark photos live on a mounted volume, so nothing is lost on redeploy.

```bash
docker build -t waypoint .
docker run -p 8000:8000 \
  -e PUBLIC_BASE_URL=http://localhost:8000 \
  -e JWT_SECRET="$(python -c 'import secrets;print(secrets.token_urlsafe(48))')" \
  -v waypoint-data:/data \
  waypoint
```

Then open http://localhost:8000. The demo account and sample routes are created automatically on
first boot.

### On Fly.io (recommended for a demo)

```bash
fly launch --no-deploy          # uses the included fly.toml
fly volumes create waypoint_data --size 1
fly secrets set JWT_SECRET="$(python -c 'import secrets;print(secrets.token_urlsafe(48))')"
fly secrets set PUBLIC_BASE_URL=https://waypoint-<you>.fly.dev
fly deploy
```

`fly.toml` sets `min_machines_running = 1` and disables auto-stop, so **judges never hit a cold
start**. It also picks the `syd` region by default; change `primary_region` if you are elsewhere.

### Before you demo

- [ ] `JWT_SECRET` is a real random value, not the dev default.
- [ ] `PUBLIC_BASE_URL` is the live URL — every share link and QR code is built from it, so a
      wrong value means every shared link points somewhere useless.
- [ ] The volume is attached and survives a redeploy (`fly volumes list`).
- [ ] HTTPS is on (Fly forces it).
- [ ] Open the URL in a private window and confirm you land **signed in**, with both sample routes
      on the dashboard. That is exactly what a judge will do.
- [ ] Set `DEMO_AUTO_LOGIN=false` as soon as the demo is over.

### Deploying to Vercel instead

`vercel.json` is included and deploys the Vite build plus the API as one project:

```bash
npx vercel --prod
npx vercel env add PUBLIC_BASE_URL production   # paste your real https:// URL
npx vercel --prod                               # env vars only apply on a fresh deploy
```

**The trade-off you are accepting:** Vercel's filesystem is ephemeral, so the database and uploaded
photos live in `/tmp` and are wiped whenever an instance recycles. Demo data **re-seeds on every
cold start**, so a judge always lands on a populated, signed-in app — but anything a visitor creates
is lost on recycle. Fine for a live pitch; do not demo photo uploads.

If judges should be able to create routes and keep them, deploy the container instead (Fly, Railway,
Render), where a mounted volume persists. `DATABASE_URL` and `UPLOAD_DIR` are the only two settings
that change.

To re-check the Vercel environment locally without deploying:

```powershell
.\backend\.venv\Scripts\python.exe .\scripts\verify_vercel_env.py
```

### Tests

```powershell
cd backend
.\.venv\Scripts\python.exe -m pytest        # 51 API + deploy-mode + demo-mode tests

cd ..\frontend
npm run lint
npm run build                               # typecheck + production build
```

---

## What's implemented

Mapped against the PRD's MVP feature list (section 7):

| PRD feature | Where it lives |
| --- | --- |
| Map destination | `pages/NewRoute.tsx` — tap the map to drop the destination pin |
| Visual route builder | `pages/RouteBuilder.tsx` — place on map, then describe; reorder freely |
| Landmark photos | Pick a photo in the creation card or the landmark editor; JPEG/PNG/WebP/GIF up to 8 MB, stored under `backend/uploads` |
| Short instructions | `action` enum + free-text instruction, with templates per action |
| Shareable route | Unguessable `share_token` → `/r/{token}` |
| QR code | `GET /api/public/routes/{token}/qr`, WhatsApp / SMS / native share |
| Mobile route viewer | `pages/PublicRoute.tsx` — map + step cards + progress |
| Landmark verification | `last_verified` / `next_verification` on every landmark |
| Six-month refresh | `services/freshness.py` + the `/verification` re-check worklist |
| Community landmarks | `pages/Contribute.tsx` + `pages/CommunityLandmarks.tsx` — contribute once, reuse anywhere |

Deliberately out of scope, per PRD section 14: no turn-by-turn GPS engine, no AI landmark
recognition, no social/review layer.

---

## Architecture

```
frontend/                 React 19 + Vite + TypeScript
  src/api/                typed fetch client + response types
  src/components/map/     Leaflet wrappers (picker + read-only route map)
  src/context/            auth context, provider, hook
  src/pages/              landing, auth, dashboard, builder, share, re-checks, viewer

backend/                  FastAPI
  app/models.py           User, Route, Landmark (+ LandmarkAction)
  app/schemas.py          request/response contracts
  app/routers/            auth, routes, landmarks, verification, public
  app/services/           freshness, qr, storage
  app/security.py         PBKDF2 password hashing, JWT
  tests/                  end-to-end API tests
```

Choices worth knowing about:

- **Maps: Leaflet + OpenStreetMap.** No API key, no billing, no quota. The PRD asks for "an existing
  mapping/navigation API rather than building a navigation engine" — OSM tiles satisfy that for
  the MVP. Swapping in Google Maps means replacing `components/map/*` only.
- **Database: SQLite by default, PostgreSQL-ready.** The MVP should run with zero setup, so
  `DATABASE_URL` defaults to a local SQLite file. Set it to
  `postgresql+psycopg://…` and nothing else changes. In Docker it points at a volume so it
  survives redeploys.
- **Photo storage: local disk behind a small interface.** `services/storage.py` is the only module
  that touches the filesystem, so moving to S3/R2 is a single-file change.
- **One container, one origin.** When `STATIC_DIR` is set, FastAPI also serves the built
  frontend, with an SPA fallback so deep links like `/r/<token>` survive a refresh. CORS is only
  enabled when the frontend is served from somewhere else.
- **Passwords: PBKDF2-HMAC-SHA256** from the standard library — no native build step, which keeps
  `pip install` reliable on any machine. Swap for argon2 before production.
- **Recipients never authenticate.** The share token in the URL *is* the credential, which is also
  why QR images use the token-scoped `/api/public/routes/{token}/qr` endpoint: an `<img>` tag cannot
  send an `Authorization` header.

### Adding a landmark

Two deliberate steps, because knowing *where* something is makes it much easier to describe:

1. **Place it on the map.** Tap the spot, or drag the amber `+` pin to adjust. The picker draws the
   destination and the landmarks already on the route as context, so the new pin lands in relation
   to them. PRD §9 lists the map position as *optional*, so there is a "skip" escape hatch for
   landmarks with no distinct spot (e.g. "the destination is opposite the black gate").
2. **Describe it.** A photo, a name, and a short instruction. The form is a disabled `<fieldset>`
   until step 1 is done, which makes the required order self-evident instead of relying on copy
   alone.

There is no upload endpoint for a landmark that does not exist yet, so a photo chosen in the
creation card is previewed locally (via an object URL) and uploaded immediately after the landmark
is created. If that upload fails the landmark is still saved and the message says so, rather than
reporting a total failure. Type and size are validated in the browser first (`lib/upload.ts`) to
save a round trip. Landmarks that already have a photo show a thumbnail in the list, so the
creator can see at a glance which ones still need one.

Landmarks can be added **in any order**. New ones append to the end, and every row carries ↑/↓
controls so the visiting order can be arranged afterwards. Reorders go through
`PUT /api/routes/{id}/landmarks/order`; the client serialises them so two rapid clicks cannot send
competing orderings for the same unique `(route_id, position)` slots.

### Community landmarks

Anyone can contribute a landmark to a shared library, and anyone can use it in their own routes.
The two-step flow is the same as the builder: place the pin, then add a photo and a name — both
are effectively required, because a community landmark without a location and a photo is useless to
a stranger.

The six-month window stays with the **contributing account**. That is the whole point, so it is
enforced in the API:

| Action | Who can do it | Effect |
| --- | --- | --- |
| `POST /public-landmarks` | any user | Starts the contributor's 180-day window |
| `POST …/verify` ("still looks the same") | **contributor only** (403 otherwise) | Restarts the window |
| `POST …/photo` | anyone | Restarts the window, records who, clears the outdated flag |
| `POST …/report` ("this is outdated") | anyone but the contributor, once per user | Sets `is_disputed`, increments `report_count` |
| `POST …/use` | any user, into their own route | Adds a step, increments `times_used` |

**A reused step is a view, not a copy.** When a route step carries a `public_landmark_id`, the
serializer overrides its `photo_url`, coordinates, and verification dates from the community
landmark. So one neighbour re-photographing a gate updates it in every route that uses it — and no
recipient can ever be shown an outdated photo. The route keeps ownership of what is genuinely
route-specific: the `action`, the `instruction` wording, and the ordering. The builder routes the
photo and "looks the same" actions to the library endpoint for such steps, and labels them
"From the community library".

Overdue and disputed landmarks are surfaced at the top of the library with a prompt to upload a
current photo or report them.

### The freshness system (PRD section 10)This is the part that keeps the product honest, so it is worth spelling out:

- A new landmark is verified on creation; `next_verification = created + 180 days`.
- Editing a landmark's **name, photo, description, or instruction** invalidates the previous
  check-in and restarts the clock — because you only just looked at it.
- Uploading a new photo also restarts the clock.
- `GET /api/verification/due` returns landmarks overdue or due within 30 days, worst first.
  `POST /api/landmarks/{id}/verify` records "still looks the same".
- The public viewer shows a `May have changed` badge on stale landmarks rather than hiding them —
  a rider is better served by a warning than by confident wrong directions.

---

## API

All creator endpoints need `Authorization: Bearer <token>`. Public endpoints need nothing.

```
POST   /api/auth/register              POST   /api/auth/login       GET /api/auth/me
POST   /api/auth/demo                  (demo mode: session without credentials)

GET    /api/routes                     POST   /api/routes
GET    /api/routes/{id}                PATCH  /api/routes/{id}      DELETE /api/routes/{id}
POST   /api/routes/{id}/share/rotate   GET    /api/routes/{id}/qr
POST   /api/routes/{id}/landmarks      PUT    /api/routes/{id}/landmarks/order

PATCH  /api/landmarks/{id}             DELETE /api/landmarks/{id}
POST   /api/landmarks/{id}/photo       POST   /api/landmarks/{id}/verify

GET    /api/verification/summary       GET    /api/verification/due

GET    /api/public-landmarks           POST   /api/public-landmarks
GET    /api/public-landmarks/{id}      PATCH  /api/public-landmarks/{id}
POST   /api/public-landmarks/{id}/photo
POST   /api/public-landmarks/{id}/verify
POST   /api/public-landmarks/{id}/report
POST   /api/public-landmarks/{id}/use

GET    /api/public/routes/{token}      GET    /api/public/routes/{token}/qr
```

---

## Logo

The mark is drawn inline as SVG (`src/components/LogoMark.tsx` — a script "WP" in navy with a gold
sunrise arc), so it stays crisp at any size and costs no network request. The palette in
`index.css` (`--brand` navy `#1b3a6b`, `--gold` `#c8a45c`) is taken from it.

**To use your own artwork instead**, drop the file at `frontend/public/logo.png` and set:

```
VITE_LOGO_URL=/logo.png
```

in `frontend/.env`. No code change. `frontend/public/favicon.svg` is the browser-tab icon and is
also yours to replace.

---

## Configuration

`backend/.env` (copy from `.env.example`; every value has a working default).
For deploys, see `.env.production.example`.

| Variable | Default | Notes |
| --- | --- | --- |
| `DATABASE_URL` | `sqlite:///./waypoint.db` | Docker sets `sqlite:////data/waypoint.db` |
| `JWT_SECRET` | insecure dev value | **Must** be changed before deploying |
| `PUBLIC_BASE_URL` | `http://localhost:5173` | Used to build share links and QR codes |
| `VERIFICATION_DAYS` | `180` | The six-month re-check window |
| `SEED_DEMO_DATA` | `true` | Seeds the demo account + routes on boot |
| `UPLOAD_DIR` | `backend/uploads` | Docker sets `/data/uploads` (on the volume) |
| `STATIC_DIR` | unset | Point at the Vite build to serve the site from the API |
| `MAX_UPLOAD_BYTES` | `8388608` | 8 MB per photo |
| `CORS_ORIGINS` | localhost:5173 | Only needed for a split deploy |

The frontend talks to `/api` and `/uploads` on its own origin; Vite proxies both to port 8000 in
dev, so there is nothing to configure locally.

---

## Before deploying (longer term)

The current setup is built for a **single long-running container**, which is the right call for a
demo. If this ever needs to scale, these are the things to change:

- [ ] Move photos to object storage (`services/storage.py` is the only module that touches disk).
- [ ] Switch `DATABASE_URL` to PostgreSQL — required before running more than one container, since
      SQLite cannot coordinate writes across replicas.
- [ ] Replace PBKDF2 with argon2 or bcrypt.
- [ ] Add rate limiting to `/api/auth/*` and the upload endpoint.
- [ ] Add refresh tokens or shorten `ACCESS_TOKEN_MINUTES` (currently 7 days).
- [ ] Run behind HTTPS so share tokens are not leaked in the clear.

## Next steps from the PRD's future scope

The cheapest high-value additions, in order: one-click WhatsApp deep linking (the share link
already builds a `wa.me` URL), landmark reliability scores from recipient feedback, and
camera/AR guidance toward the next landmark.

Two that fall out of the community library and are worth building next: a scheduled job that nudges
contributors before their window expires (the logic already exists in `services/freshness.py`, it
just needs a scheduler), and showing a landmark's contributor on the recipient view so people can
thank the person who added the gate that saved them.
