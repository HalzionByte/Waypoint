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

## There is no backend

WayPoint is a **static site**. All data — routes, landmarks, community entries, photos — lives in the
visitor's own browser, in IndexedDB. There is no server, no database to provision, no API key, and
no environment variables to set.

That is a deliberate trade, and this section is the honest version of what it costs and buys.

**Buys**

- Deploys anywhere static hosting runs, with nothing to configure.
- Cannot go down, and cannot be rate-limited or hacked into an outage.
- Photo upload, route creation and the community library all work fully, with no size ceiling worth
  worrying about.
- Reloading the page keeps everything. A judge's work survives a refresh.

**Costs**

- Data is per-browser. Two devices do not see each other's routes. A route shared as a link works
  (see below), but there is no shared library across people.
- Clearing site data wipes it. There is no server-side copy. The footer has a **Reset to the sample
  data** button, which is the fastest way back to a clean demo between runs.
- Anyone with the URL can edit everything. There is no auth at all.

For a demo this is the right trade: it is the version that cannot fail on the day.

---

## Quick start

```powershell
cd frontend
npm install
npm run dev
```

Open http://localhost:5173. The two sample routes and the community library are created in your
browser on first load, so there is no seeding step and no login.

```powershell
npm run lint      # 0 warnings
npm run build     # typecheck + production build
```

## Deploying

Vercel, from the repo root:

```bash
npx vercel --prod
```

`vercel.json` builds `frontend/` as a static site and rewrites unknown paths to `index.html`, so deep
links such as `/r/<token>` survive a refresh and a shared link can be pasted into any chat.

Any other static host works the same way — build `frontend/`, publish `frontend/dist/`, and make sure
unknown paths fall back to `index.html`. There are no environment variables to set, and no secrets
to leak. The only optional one is `VITE_LOGO_URL` (see **Logo**).

### Before you demo

- [ ] Open the deployed URL in a **private window** — that is what a judge does — and confirm you
      land on a dashboard with both sample routes and no login.
- [ ] Paste a share link into a chat and open it **on your phone**. That is the one thing most likely
      to surprise you, and it is covered below.
- [ ] Check a photo upload works on the demo machine's browser.
- [ ] Keep the Reset button in mind: after a judge has clicked through and deleted your samples,
      one click puts it back.

---

## Share links without a server

A share link used to be `origin/r/<token>` with the token looked up in a database. With no server
there is nothing to look it up, so **the route travels inside the link**: the steps are packed into
the URL fragment as base64url (`lib/share.ts`).

A fragment is never sent to a server, so this costs no request and works on any device that opens the
link. The recipient view reads this browser's own data first, and falls back to the payload, so a
link opened on a phone with no WayPoint data still renders the full route, the map and the
instructions.

Two limits, both inherent to putting a route in a URL:

- **Photos do not travel.** A Blob is far too large for a URL, so a shared link shows the steps, the
  map and the instructions, but not the pictures. Photos stay on the device that took them.
- **The QR code encodes the short link** (`/r/<token>`), because a QR code cannot carry a payload this
  size. So the QR opens on a device that already has the data — useful for a poster or a notice board
  at your own place, not for sending to a stranger. **Send the link, not the QR**, when the recipient
  is someone else's device.

---

## What's implemented

Mapped against the PRD's MVP feature list (section 7):

| PRD feature | Where it lives |
| --- | --- |
| Map destination | `pages/NewRoute.tsx` — tap the map to drop the destination pin |
| Visual route builder | `pages/RouteBuilder.tsx` — place on map, then describe; reorder freely |
| Landmark photos | Pick a photo in the creation card or the landmark editor; JPEG/PNG/WebP/GIF up to 8 MB, stored as a Blob in IndexedDB |
| Short instructions | `action` enum + free-text instruction, with templates per action |
| Shareable route | Payload in the URL fragment → `/r/{token}#d=…` (`lib/share.ts`) |
| QR code | Drawn in the browser (`lib/useQrDataUrl.ts`), plus WhatsApp / SMS / native share |
| Mobile route viewer | `pages/PublicRoute.tsx` — map + step cards + progress |
| Landmark verification | `last_verified` / `next_verification` on every landmark |
| Six-month refresh | `lib/store.ts` freshness helpers + the `/verification` re-check worklist |
| Community landmarks | `pages/Contribute.tsx` + `pages/CommunityLandmarks.tsx` — contribute once, reuse anywhere |

Deliberately out of scope, per PRD section 14: no turn-by-turn GPS engine, no AI landmark
recognition, no social/review layer.

---

## Architecture

```
frontend/
  src/api/            the data API, served by the browser, plus the response types
  src/lib/idb.ts      a small promise wrapper over IndexedDB
  src/lib/store.ts    the data layer: records, serialisers, CRUD, freshness, seeding
  src/lib/share.ts    packing a route into a link, and unpacking it
  src/components/map/ Leaflet wrappers (picker + read-only route map)
  src/context/        the session context (one account, no sign-in)
  src/pages/          landing, dashboard, builder, share, re-checks, viewer
```

Choices worth knowing about:

- **Maps: Leaflet + OpenStreetMap.** No API key, no billing, no quota. The PRD asks for "an existing
  mapping/navigation API rather than building a navigation engine" — OSM tiles satisfy that. Swapping
  in Google Maps means replacing `components/map/*` only.
- **IndexedDB, not localStorage.** Landmark photos are stored as Blobs, and localStorage caps out
  around 5 MB of strings. IndexedDB stores Blobs natively and has room to grow, which is the
  difference between photo upload working and throwing `QuotaExceededError`.
- **The whole dataset is read once and held in memory.** Every screen then renders synchronously, with
  no loading spinners. Judges click fast, and a flash of "Loading…" on every navigation reads as
  broken. Writes go to IndexedDB and update the in-memory copy.
- **Photos are references, not URLs.** A stored photo is `photo:<id>`; `lib/usePhotoSrc.ts` resolves
  it to an object URL and revokes it on unmount, so browsing a gallery does not pin every image in
  memory for the life of the tab.
- **The data API keeps its old shape.** `src/api/client.ts` still exposes `api.listRoutes()`,
  `api.uploadPhoto()` and the rest with the signatures they had when FastAPI served them, so the pages
  did not have to change. Only the implementation moved.

### Adding a landmark

Two deliberate steps, because knowing *where* something is makes it much easier to describe:

1. **Place it on the map.** Tap the spot, or drag the amber `+` pin to adjust. The picker draws the
   destination and the landmarks already on the route as context, so the new pin lands in relation to
   them. PRD §9 lists the map position as *optional*, so there is a "skip" escape hatch for landmarks
   with no distinct spot (e.g. "the destination is opposite the black gate").
2. **Describe it.** A photo, a name, and a short instruction. The form is a disabled `<fieldset>` until
   step 1 is done, which makes the required order self-evident instead of relying on copy alone.

Landmarks can be added **in any order**. New ones append to the end, and every row carries ↑/↓ controls
so the visiting order can be arranged afterwards. Landmarks that already have a photo show a
thumbnail in the list, so the creator can see at a glance which ones still need one. Type and size are
validated in the browser first (`lib/upload.ts`) so a bad file never reaches storage.

### Community landmarks

Anyone can contribute a landmark to a shared library, and anyone can use it in their own routes. The
two-step flow is the same as the builder: place the pin, then add a photo and a name.

The six-month window stays with the **contributor**:

| Action | Who can do it | Effect |
| --- | --- | --- |
| contribute | anyone | Starts the contributor's 180-day window |
| "still looks the same" | **contributor only** | Restarts the window |
| upload a new photo | anyone | Restarts the window, records who, clears the outdated flag |
| "this is outdated" | anyone but the contributor, once | Sets `is_disputed`, increments `report_count` |
| use in a route | anyone | Adds a step, increments `times_used` |

**A reused step is a view, not a copy.** When a route step carries a `public_landmark_id`,
`landmarkOut()` reads its photo, coordinates and verification dates from the community landmark. So
one neighbour re-photographing a gate updates it in every route that uses it — and no recipient can
ever be shown an outdated photo. The route keeps ownership of what is genuinely route-specific: the
`action`, the `instruction` wording, and the ordering.

Overdue and disputed landmarks are surfaced at the top of the library with a prompt to upload a
current photo or report them.

### The freshness system (PRD section 10)

This is the part that keeps the product honest, so it is worth spelling out:

- A new landmark is verified on creation; `next_verification = created + 180 days`.
- Editing a landmark's **name, photo, description, or instruction** restarts the clock — because you
  only just looked at it.
- Uploading a new photo also restarts the clock.
- `/verification` lists landmarks overdue or due within 30 days, soonest first, and offers a
  "still looks the same" button that records the check-in.
- The public viewer shows a `May have changed` badge on stale landmarks rather than hiding them — a
  person walking is better served by a warning than by confident wrong directions.

---

## Logo

The mark is drawn inline as SVG (`src/components/LogoMark.tsx` — a script "WP" in navy with a gold
sunrise arc), so it stays crisp at any size and costs no network request. The palette in `index.css`
(`--brand` navy `#1b3a6b`, `--gold` `#c8a45c`) is taken from it.

**To use your own artwork instead**, drop the file at `frontend/public/logo.png` and set
`VITE_LOGO_URL=/logo.png` in `frontend/.env`. No code change. `frontend/public/favicon.svg` is the
browser-tab icon and is also yours to replace.

---

## The `backend/` directory

`backend/` holds the FastAPI + SQLite implementation this app was first built against. **It is not
used, not built, and not deployed** — the frontend makes no network requests at all. It is kept only
as the reference for the data model, the freshness rules, and the request/response shapes in
`src/api/types.ts`, which still mirror `backend/app/schemas.py`.

If you ever want a real multi-user backend back, that directory plus its 52 passing tests
(`cd backend && .\.venv\Scripts\python.exe -m pytest`) is the starting point, and the client is shaped
so it could be swapped back in without touching the pages.

---

## If this ever needs to be more than a demo

In rough order of how much they matter:

- [ ] **Move data off the browser.** Everything above assumes one person, one browser. Multi-user
      needs a server, and `src/api/client.ts` is the only module that would change.
- [ ] **Store photos in object storage** (S3/R2) rather than IndexedDB, which is per-browser and
      bounded by the user's disk quota.
- [ ] **Add real auth.** There is none, so anyone with the URL can edit everything.
- [ ] **Server-generated share tokens.** The current link carries its own payload, which is
      tamperable by design: a recipient can edit what they are shown. That is acceptable for a demo
      and wrong for directions someone relies on.

## Next steps from the PRD's future scope

The cheapest high-value additions, in order: landmark reliability scores from recipient feedback
(the recipient view already tracks which steps matched), a nudge to contributors before their window
expires (the logic exists in `lib/store.ts`, it just needs a scheduler), and camera/AR guidance
toward the next landmark.
