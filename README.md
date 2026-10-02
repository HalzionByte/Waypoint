# WayPoint

**Maps get you to the area. WayPoint gets you to the door.**

WayPoint is a visual last-mile navigation layer built from local landmarks, photos, and short
instructions — the "go past the Samsung repair shop, continue until the brown gate, turn left, stop
opposite the black gate" way of describing a place.

A creator pins a destination, builds an ordered sequence of landmarks, uploads a photo and a one
line instruction for each, then shares the route as a link or a QR code. Recipients need no
account: they open the link, walk the final few hundred metres, and tick off each landmark as they
match it against the photo.

Built from `LandmarkX_PRD.docx`.

---

## Architecture

A React SPA and a FastAPI service, talking JSON over a small REST API.

```
frontend/          React 19 + TypeScript + Vite
  src/api/         client.ts — the data API, and the response types
  src/lib/http.ts  the only module that calls fetch(): token, errors, uploads
  src/context/     the session (AuthProvider)
  src/components/  UI, including the Leaflet wrappers
  src/pages/       landing, sign-in, dashboard, builder, share, re-checks, viewer
  src/lib/         share/format/action helpers, photo validation, QR rendering

backend/           FastAPI + SQLAlchemy + SQLite (PostgreSQL-ready)
  app/routers/     auth, routes, landmarks, public, community, verification
  app/services/    freshness rules, photo storage, QR/share URLs, demo seeding
  app/schemas.py   request/response contracts — mirrored by frontend/src/api/types.ts
  tests/           52 tests
```

`src/api/client.ts` is the seam. Every page calls `api.*()` and knows nothing about transport, so
the data source has been swappable — it served the app from IndexedDB first, and now serves it from
the API — without a single page changing.

### Auth

Bearer-token sessions. `POST /api/auth/register|login|demo` returns a JWT, the SPA keeps it in
`localStorage`, and `lib/http.ts` attaches it to every request. A token the server rejects clears
itself and drops the app to signed-out, so an expired session never leaves a half-broken screen.

Passwords are PBKDF2-HMAC-SHA256 at 260k rounds, hashed in `app/security.py` with no native build
dependency. Swap in argon2 or bcrypt when there is a reason to.

`/r/<token>` is deliberately anonymous — someone following a shared link has no account and is not
asked for one. Everything else requires a session.

### Why these choices

- **Leaflet + OpenStreetMap.** No API key, no billing, no quota. The PRD asks for "an existing
  mapping/navigation API rather than building a navigation engine" — OSM tiles satisfy that.
  Swapping in Google Maps means replacing `components/map/*` only.
- **Photos on the server, referenced by URL.** `app/services/storage.py` sits behind a small
  interface so the local disk can be swapped for S3/R2 without touching a router.
- **Freshness is computed, not scheduled.** Staleness is derived from `next_verification` on every
  read, so it cannot drift out of sync with the data.
- **The whole dataset is read per screen.** Every page fetches what it needs and renders it. No
  client-side cache to invalidate, and no stale directions — which matters more here than in most
  apps, because a stale landmark sends a person to the wrong door.

---

## Quick start

Two processes. The API on 8000, Vite on 5173.

```powershell
# terminal 1 — API
cd backend
.\.venv\Scripts\python.exe -m uvicorn app.main:app --reload --port 8000
```

```powershell
# terminal 2 — frontend
cd frontend
npm install
npm run dev
```

Open http://localhost:5173. The sample routes and community library are seeded on first boot, so
there is nothing to set up.

**Vite proxies `/api` and `/uploads` to 127.0.0.1:8000** (see `vite.config.ts`), so the browser
only ever talks to one origin and there is no CORS in development.

The sign-in page has an **"open the demo account"** button that needs no credentials.

```powershell
cd frontend
npm run lint      # 0 warnings
npm run build     # typecheck + production build
```

---

## Configuration

Both halves read their own `.env` one directory down. Both are gitignored; start from the
`.env.example` beside them. **Every value has a working default for local development**, so you only
need to touch them when deploying.

`backend/.env`:

| Variable | Default | Notes |
| --- | --- | --- |
| `DATABASE_URL` | SQLite in `backend/` | Point at `postgresql+psycopg://…` for production |
| `JWT_SECRET` | an insecure dev default | **Must** be changed before deploying |
| `PUBLIC_BASE_URL` | `http://localhost:5173` | The *frontend*, used to build share links and QR codes |
| `PUBLIC_API_BASE` | empty | This API's origin — see below |
| `STATIC_DIR` | unset | Path to the built SPA, for a single-container deploy |
| `SEED_DEMO_DATA` | `true` | Seeds the demo account and samples on an empty database |
| `DEMO_AUTO_LOGIN` | `true` | Enables the credential-free demo sign-in. Turn off for anything real |
| `CORS_ORIGINS` | localhost | Only needed on a split deploy |

`frontend/.env`: just `VITE_API_BASE_URL`, which should stay **empty** unless you are doing a split
deploy. Empty means "same origin", which is correct for both dev and a single container.

---

## Deploying

Both shapes are supported and both are verified.

### Option A — one container (recommended)

One process serves the API *and* the built site. One public URL, no CORS, and relative `/uploads/…`
paths just work.

```bash
cd frontend && npm run build          # produces frontend/dist
```

Then on the API host:

```bash
STATIC_DIR=../frontend/dist \
PUBLIC_BASE_URL=https://your-domain \
JWT_SECRET=<a real secret> \
DEMO_AUTO_LOGIN=false \
uvicorn app.main:app --host 0.0.0.0 --port $PORT
```

FastAPI serves `/assets`, falls back to `index.html` for unknown paths (so `/dashboard` and
`/r/<token>` survive a refresh), and deliberately refuses to let that fallback swallow `/api/*` —
a mistyped endpoint 404s as JSON instead of returning HTML the client would fail to parse.

### Option B — split (Vercel + a separate API host)

Site on Vercel, API on Render/Railway/Fly.

```bash
# 1. the API host
PUBLIC_BASE_URL=https://your-app.vercel.app \
PUBLIC_API_BASE=https://your-api.onrender.com \
CORS_ORIGINS=https://your-app.vercel.app \
JWT_SECRET=<a real secret> \
uvicorn app.main:app --host 0.0.0.0 --port $PORT
```

```bash
# 2. the frontend — VITE_API_BASE_URL is required here
cd frontend
VITE_API_BASE_URL=https://your-api.onrender.com npx vercel --prod
```

`vercel.json` builds `frontend/` as a static site and rewrites unknown paths to `index.html`.

> **`PUBLIC_API_BASE` is the setting people miss.** Photos are stored as relative paths
> (`/uploads/x.jpg`). Without it, a browser on the Vercel origin resolves those against the *site*,
> not the API, and every photo 404s.

### When the site loads but shows no data

Open `<your-api>/health/config` in a browser. It reports whether the calling origin is allowed:

```json
{ "caller_origin_allowed": false, "cors_origins": ["..."] }
```

`false` means the frontend's origin is missing from `CORS_ORIGINS` and the browser is silently
dropping every request. It also echoes back the database, upload dir and public base URLs, so one
page tells you which box you forgot to tick.

---

## Share links

A share link is `https://your-site/r/<token>`, and the server resolves the token.

An earlier version had no backend at all, so the route was packed into the URL fragment as base64url
and travelled inside the link. That worked, but it capped the URL length and — because a Blob is far
too large for a URL — **the photos could not travel at all**. A shared link showed the steps, the
map and the instructions on the recipient's phone, and no pictures.

With a server that is gone. The same link now renders identically on any device, photos included.
`POST /api/routes/{id}/share/rotate` issues a new token and kills the old link, which is the
correct behaviour for a URL that may have been pasted into a chat you cannot recall.

The QR code is still drawn in the browser (`lib/useQrDataUrl.ts`) from the same short link, so it
now works as a real poster code on a stranger's phone.

---

## What's implemented

Mapped against the PRD's MVP feature list (section 7):

| PRD feature | Where it lives |
| --- | --- |
| Accounts | `POST /api/auth/register|login`, `pages/Login.tsx` |
| Map destination | `pages/NewRoute.tsx` — tap the map to drop the destination pin |
| Visual route builder | `pages/RouteBuilder.tsx` — place on map, then describe; reorder freely |
| Landmark photos | JPEG/PNG/WebP/GIF up to 8 MB, validated in the browser and again on upload |
| Short instructions | `action` enum + free-text instruction, with templates per action |
| Shareable route | `POST /api/routes/{id}/share/rotate` → `/r/{token}` |
| QR code | Drawn in the browser (`lib/useQrDataUrl.ts`), plus WhatsApp / SMS / native share |
| Mobile route viewer | `pages/PublicRoute.tsx` — map + step cards + progress |
| Landmark verification | `last_verified` / `next_verification` on every landmark |
| Six-month refresh | `services/freshness.py` + the `/verification` re-check worklist |
| Community landmarks | `pages/Contribute.tsx` + `pages/CommunityLandmarks.tsx` |

Deliberately out of scope, per PRD section 14: no turn-by-turn GPS engine, no AI landmark
recognition, no social/review layer.

---

### Adding a landmark

Two deliberate steps, because knowing *where* something is makes it much easier to describe:

1. **Place it on the map.** Tap the spot, or drag the amber `+` pin to adjust. The picker draws the
   destination and the landmarks already on the route as context, so the new pin lands in relation
   to them. PRD §9 lists the map position as *optional*, so there is a "skip" escape hatch for
   landmarks with no distinct spot (e.g. "the destination is opposite the black gate").
2. **Describe it.** A photo, a name, and a short instruction. The form is a disabled `<fieldset>`
   until step 1 is done, which makes the required order self-evident instead of relying on copy
   alone.

Landmarks can be added **in any order**. New ones append to the end, and every row carries ↑/↓
controls so the visiting order can be arranged afterwards. Reordering is one `PUT` of the whole
sequence rather than a request per row, and the server rejects a partial list.

### Community landmarks

Anyone can contribute a landmark to a shared library, and anyone can use it in their own routes.

The six-month window stays with the **contributor**:

| Action | Who can do it | Effect |
| --- | --- | --- |
| contribute | anyone | Starts the contributor's 180-day window |
| "still looks the same" | **contributor only** | Restarts the window |
| upload a new photo | anyone | Restarts the window, records who, clears the outdated flag |
| "this is outdated" | anyone but the contributor, once | Sets `is_disputed`, increments `report_count` |
| use in a route | anyone | Adds a step, increments `times_used` |

**A reused step is a view, not a copy.** `landmark_out()` in `app/serializers.py` reads a step's
photo, coordinates and verification dates from the community landmark it points at. So one
neighbour re-photographing a gate updates it in every route that uses it — and no recipient can
ever be shown an outdated photo. The route keeps ownership of what is genuinely route-specific: the
`action`, the `instruction` wording, and the ordering.

Overdue and disputed landmarks are surfaced at the top of the library with a prompt to upload a
current photo or report them.

### The freshness system (PRD section 10)

This is the part that keeps the product honest:

- A new landmark is verified on creation; `next_verification = created + 180 days`.
- Editing a landmark's **name, photo, description, or instruction** restarts the clock — because
  you only just looked at it.
- Uploading a new photo also restarts the clock.
- `/verification` lists landmarks overdue or due within 30 days, soonest first, and offers a
  "still looks the same" button that records the check-in.
- The public viewer shows a `May have changed` badge on stale landmarks rather than hiding them — a
  person walking is better served by a warning than by confident wrong directions.

---

## Tests

```bash
cd backend
.\.venv\Scripts\python.exe -m pytest              # 52 tests
.\.venv\Scripts\python.exe smoke_test.py          # 50 checks against a running API
.\.venv\Scripts\python.exe ..\scripts\verify_cold_start.py   # 20 checks, split-deploy simulation
```

`pytest` covers the API against an isolated database. `smoke_test.py` drives a **running** server
through the exact call sequence `src/api/client.ts` makes — including the multipart upload and the
anonymous public view — and asserts the behaviour that is easy to break silently, such as a
reordered list actually taking effect and a rotated token killing the old link.

`verify_cold_start.py` simulates the nastiest deploy case: a cold instance, an empty database, no
lifespan event (Render and Vercel both skip it), and a frontend on a completely different origin.
That is where CORS and photo-URL resolution break.

The frontend has no test runner. `npm run build` typechecks the whole app, and `npm run lint` is
clean.

---

## Logo

The mark is drawn inline as SVG (`src/components/LogoMark.tsx` — a script "WP" in navy with a gold
sunrise arc), so it stays crisp at any size and costs no network request. The palette in `index.css`
(`--brand` navy `#1b3a6b`, `--gold` `#c8a45c`) is taken from it.

**To use your own artwork instead**, drop the file at `frontend/public/logo.png` and set
`VITE_LOGO_URL=/logo.png` in `frontend/.env`. No code change. `frontend/public/favicon.svg` is the
browser-tab icon and is also yours to replace.

---

## Before you demo

- [ ] Open the deployed URL in a **private window** and confirm you land on the sign-in page with
      no session, then that the demo button gets you in.
- [ ] Paste a share link into a chat and open it **on your phone**. Confirm the photos load — this
      is the thing that only became possible once there was a backend.
- [ ] Check a photo upload works on the demo machine's browser.
- [ ] Confirm `JWT_SECRET` is set and `DEMO_AUTO_LOGIN` matches what you want.

---

## Known limits

Stated plainly rather than discovered later:

- **Photo storage is a local directory.** Fine for one instance; it does not survive a redeploy on
  most PaaS filesystems and does not work across replicas. `services/storage.py` is the only thing
  to change for S3/R2.
- **SQLite by default.** One writer, one machine. `DATABASE_URL` takes PostgreSQL.
- **No refresh tokens.** The access token lives in `localStorage` and lasts 7 days. Signing out
  clears it, but an XSS bug would be a full account compromise. A cookie-based session with CSRF
  protection is the fix if this goes near real users.
- **PBKDF2, not argon2.** Fine, and dependency-free. Not the modern recommendation.
- **The JS bundle is ~507 kB** (160 kB gzipped), most of it Leaflet and the QR encoder. It is one
  chunk because nothing is lazy-loaded; route-splitting would cut the landing page considerably.