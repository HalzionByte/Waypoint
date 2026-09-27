/**
 * The whole data layer, in the browser.
 *
 * This replaces the FastAPI + SQLite backend. The shapes it stores and returns
 * are the ones `../api/types` already describes, so every page keeps working
 * unchanged: the API was the only thing that moved.
 *
 * Two things are worth knowing before reading on:
 *
 * 1. There is one account. The app has no sign-in, so "who owns this" is
 *    answered by LOCAL_USER_ID and nothing else. Community landmarks stay
 *    meaningful because they model a contributor, not a login.
 *
 * 2. Photos are Blobs in IndexedDB, referenced as `photo:<id>`. They are not
 *    base64 in a URL, so nothing hits localStorage's size ceiling.
 */

import type {
  DueLandmark,
  Landmark,
  LandmarkAction,
  LandmarkCounts,
  LandmarkInput,
  PublicLandmark,
  RouteDetail,
  RouteInput,
  RouteSummary,
  User,
  VerificationSummary,
} from '../api/types'
import {
  STORES,
  idbDelete,
  idbGet,
  idbPut,
  idbSnapshot,
  idbWipe,
} from './idb'
import type { StoreName } from './idb'

/** The single account every visitor acts as. */
export const LOCAL_USER: User = {
  id: 1,
  name: 'Demo Creator',
  email: 'demo@waypoint.app',
  created_at: '2026-01-01T00:00:00.000Z',
}

const LOCAL_USER_ID = LOCAL_USER.id

/** PRD section 10: a landmark must be re-confirmed within six months. */
export const VERIFICATION_DAYS = 180

/** Inside this window a landmark is "due soon" rather than merely valid. */
export const DUE_SOON_DAYS = 30

// --------------------------------------------------------------------- records

interface RouteRecord {
  id: number
  owner_id: number
  title: string
  destination_name: string
  destination_address: string
  destination_lat: number
  destination_lng: number
  share_token: string
  is_published: boolean
  created_at: string
  updated_at: string
}

interface LandmarkRecord {
  id: number
  route_id: number
  position: number
  name: string
  action: LandmarkAction
  instruction: string
  description: string
  photo_url: string | null
  lat: number | null
  lng: number | null
  public_landmark_id: number | null
  created_at: string
  last_verified: string | null
  next_verification: string | null
}

interface PublicLandmarkRecord {
  id: number
  contributor_id: number
  name: string
  description: string
  photo_url: string | null
  lat: number
  lng: number
  created_at: string
  last_verified: string | null
  next_verification: string | null
  last_verified_by_id: number | null
  is_disputed: boolean
  report_count: number
  times_used: number
}

interface ReportRecord {
  id: number
  landmark_id: number
  reporter_id: number
  note: string
  created_at: string
}

// ------------------------------------------------------------------- freshness

function asDate(value: string | null | undefined): Date | null {
  if (!value) return null
  const parsed = new Date(value)
  return Number.isNaN(parsed.getTime()) ? null : parsed
}

export function isStale(nextVerification: string | null | undefined): boolean {
  const due = asDate(nextVerification)
  if (!due) return true
  return due.getTime() < Date.now()
}

export function isDueSoon(
  nextVerification: string | null | undefined,
  windowDays = DUE_SOON_DAYS,
): boolean {
  const due = asDate(nextVerification)
  if (!due) return true
  const now = Date.now()
  const at = due.getTime()
  return at >= now && at <= now + windowDays * 86_400_000
}

export function daysUntilDue(nextVerification: string | null | undefined): number | null {
  const due = asDate(nextVerification)
  if (!due) return null
  return Math.floor((due.getTime() - Date.now()) / 86_400_000)
}

export function statusOf(nextVerification: string | null | undefined): DueLandmark['status'] {
  if (isStale(nextVerification)) return 'overdue'
  if (isDueSoon(nextVerification)) return 'due_soon'
  return 'verified'
}

export function dueDate(from?: Date | null): string {
  const base = from ?? new Date()
  return new Date(base.getTime() + VERIFICATION_DAYS * 86_400_000).toISOString()
}

/** A new landmark counts as verified the day it is created. */
function initialVerification(): { last_verified: string; next_verification: string } {
  const now = new Date()
  return { last_verified: now.toISOString(), next_verification: dueDate(now) }
}

// ---------------------------------------------------------------------- photos

const PHOTO_PREFIX = 'photo:'

/** Type guard, so callers narrow `string | null | undefined` to `string`. */
export function isPhotoRef(value: string | null | undefined): value is string {
  return typeof value === 'string' && value.startsWith(PHOTO_PREFIX)
}

async function savePhotoBlob(file: File): Promise<string> {
  const id = `p${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`
  await idbPut(STORES.photos, file, id)
  return `${PHOTO_PREFIX}${id}`
}

export async function readPhotoBlob(ref: string): Promise<Blob | undefined> {
  if (!isPhotoRef(ref)) return undefined
  return idbGet<Blob>(STORES.photos, ref.slice(PHOTO_PREFIX.length))
}
async function deletePhotoBlob(ref: string | null | undefined): Promise<void> {
  if (!isPhotoRef(ref)) return
  await idbDelete(STORES.photos, ref.slice(PHOTO_PREFIX.length))
}

// ----------------------------------------------------------------------- ids

/**
 * Monotonic ids, persisted in the meta store so a reload never reuses one.
 * IndexedDB serialises transactions, so a plain read-increment-write is enough
 * to stay unique.
 */
async function nextId(store: StoreName): Promise<number> {
  const key = `seq:${store}`
  const current = ((await idbGet<number>(STORES.meta, key)) ?? 0) + 1
  await idbPut(STORES.meta, current, key)
  return current
}

function randomToken(): string {
  const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789'
  const bytes = new Uint8Array(16)
  crypto.getRandomValues(bytes)
  return Array.from(bytes, (b) => alphabet[b % alphabet.length]).join('')
}

// ------------------------------------------------------------------ in-memory

/**
 * The dataset is read whole on boot and kept in memory. Every screen then
 * renders synchronously with no loading spinners, which is what a demo needs:
 * judges click fast and a flash of "Loading…" on every navigation reads as
 * broken. Writes go to IndexedDB and update the cache.
 */
let cache: {
  routes: RouteRecord[]
  landmarks: LandmarkRecord[]
  publicLandmarks: PublicLandmarkRecord[]
  reports: ReportRecord[]
} | null = null

let loading: Promise<void> | null = null

export function ready(): Promise<void> {
  if (cache) return Promise.resolve()
  if (!loading) {
    loading = idbSnapshot<{
      routes: RouteRecord[]
      landmarks: LandmarkRecord[]
      publicLandmarks: PublicLandmarkRecord[]
      reports: ReportRecord[]
    }>()
      .then((data) => {
        cache = {
          routes: data.routes ?? [],
          landmarks: data.landmarks ?? [],
          publicLandmarks: data.publicLandmarks ?? [],
          reports: data.reports ?? [],
        }
        return ensureSeeded()
      })
      .then(() => {
        loading = null
      })
      .catch((err) => {
        // Leave `loading` null so a later call can retry: a transient IndexedDB
        // failure (private mode, another tab holding the old version) should
        // not permanently break the app for this page view.
        loading = null
        throw err
      })
  }
  return loading
}

function data(): NonNullable<typeof cache> {
  if (!cache) throw new Error('store used before ready()')
  return cache
}

// ---------------------------------------------------------------- serialisers

function countsFor(landmarks: LandmarkRecord[]): LandmarkCounts {
  let verified = 0
  let stale = 0
  for (const lm of landmarks) {
    if (isStale(lm.next_verification)) stale += 1
    else verified += 1
  }
  return { total: landmarks.length, verified, stale }
}

export function shareUrlFor(token: string): string {
  const base =
    typeof window === 'undefined' ? '' : `${window.location.origin}${import.meta.env.BASE_URL}`
  return `${base.replace(/\/$/, '')}/r/${token}`
}

function routeSummary(route: RouteRecord): RouteSummary {
  return {
    id: route.id,
    owner_id: route.owner_id,
    title: route.title,
    destination_name: route.destination_name,
    destination_address: route.destination_address,
    destination_lat: route.destination_lat,
    destination_lng: route.destination_lng,
    share_token: route.share_token,
    share_url: shareUrlFor(route.share_token),
    is_published: route.is_published,
    created_at: route.created_at,
    updated_at: route.updated_at,
    landmark_counts: countsFor(data().landmarks.filter((l) => l.route_id === route.id)),
  }
}

/**
 * A step that reuses a community landmark is a *view* of it, not a copy: the
 * physical facts and the six-month window belong to the contributor. Reading
 * them through here means one refresh updates every route at once, and
 * recipients can never be shown an outdated photo.
 */
function landmarkOut(record: LandmarkRecord): Landmark {
  const store = data()
  const source = record.public_landmark_id
    ? store.publicLandmarks.find((p) => p.id === record.public_landmark_id)
    : undefined

  const lastVerified = source ? source.last_verified : record.last_verified
  const nextVerification = source ? source.next_verification : record.next_verification

  return {
    id: record.id,
    route_id: record.route_id,
    position: record.position,
    name: source ? source.name : record.name,
    action: record.action,
    instruction: record.instruction,
    description: source ? source.description : record.description,
    photo_url: (source ? source.photo_url : record.photo_url) ?? null,
    lat: source ? source.lat : record.lat,
    lng: source ? source.lng : record.lng,
    created_at: record.created_at,
    last_verified: lastVerified,
    next_verification: nextVerification,
    is_stale: isStale(nextVerification),
    public_landmark_id: record.public_landmark_id,
  }
}

function publicLandmarkOut(record: PublicLandmarkRecord): PublicLandmark {
  const mine = record.contributor_id === LOCAL_USER_ID
  const reportedByMe = data().reports.some(
    (r) => r.landmark_id === record.id && r.reporter_id === LOCAL_USER_ID,
  )
  return {
    id: record.id,
    name: record.name,
    photo_url: record.photo_url,
    lat: record.lat,
    lng: record.lng,
    description: record.description,
    contributor_id: record.contributor_id,
    contributor_name: record.contributor_id === LOCAL_USER_ID ? LOCAL_USER.name : 'A neighbour',
    last_verified_by:
      record.last_verified_by_id === LOCAL_USER_ID || record.last_verified_by_id === null
        ? LOCAL_USER.name
        : 'A neighbour',
    created_at: record.created_at,
    last_verified: record.last_verified,
    next_verification: record.next_verification,
    is_stale: isStale(record.next_verification),
    is_disputed: record.is_disputed,
    report_count: record.report_count,
    times_used: record.times_used,
    is_mine: mine,
    // The authoritative six-month check stays with the contributing account.
    can_verify: mine,
    reported_by_me: reportedByMe,
  }
}

// ---------------------------------------------------------------------- routes

export function listRoutes(): RouteSummary[] {
  return data()
    .routes.filter((r) => r.owner_id === LOCAL_USER_ID)
    .sort((a, b) => b.updated_at.localeCompare(a.updated_at))
    .map(routeSummary)
}

export function getRoute(id: number): RouteDetail {
  const route = data().routes.find((r) => r.id === id)
  if (!route) throw new Error('That route no longer exists.')
  return {
    ...routeSummary(route),
    landmarks: data()
      .landmarks.filter((l) => l.route_id === id)
      .sort((a, b) => a.position - b.position)
      .map(landmarkOut),
  }
}

export async function createRoute(input: RouteInput): Promise<RouteDetail> {
  await ready()
  const now = new Date().toISOString()
  const record: RouteRecord = {
    id: await nextId(STORES.routes),
    owner_id: LOCAL_USER_ID,
    title: input.title,
    destination_name: input.destination_name ?? '',
    destination_address: input.destination_address ?? '',
    destination_lat: input.destination_lat,
    destination_lng: input.destination_lng,
    share_token: randomToken(),
    is_published: true,
    created_at: now,
    updated_at: now,
  }
  data().routes.push(record)
  await idbPut(STORES.routes, record)
  return getRoute(record.id)
}

export async function updateRoute(
  id: number,
  patch: Partial<RouteInput> & { is_published?: boolean },
): Promise<RouteDetail> {
  await ready()
  const route = data().routes.find((r) => r.id === id)
  if (!route) throw new Error('That route no longer exists.')

  if (patch.title !== undefined) route.title = patch.title
  if (patch.destination_name !== undefined) route.destination_name = patch.destination_name
  if (patch.destination_address !== undefined) {
    route.destination_address = patch.destination_address
  }
  if (patch.destination_lat !== undefined) route.destination_lat = patch.destination_lat
  if (patch.destination_lng !== undefined) route.destination_lng = patch.destination_lng
  if (patch.is_published !== undefined) route.is_published = patch.is_published
  route.updated_at = new Date().toISOString()

  await idbPut(STORES.routes, route)
  return getRoute(id)
}

export async function deleteRoute(id: number): Promise<void> {
  await ready()
  const store = data()
  const steps = store.landmarks.filter((l) => l.route_id === id)
  for (const step of steps) {
    await deletePhotoBlob(step.photo_url)
    store.landmarks.splice(store.landmarks.indexOf(step), 1)
    await idbDelete(STORES.landmarks, step.id)
  }
  const index = store.routes.findIndex((r) => r.id === id)
  if (index >= 0) store.routes.splice(index, 1)
  await idbDelete(STORES.routes, id)
}

export async function rotateShareToken(id: number): Promise<RouteSummary> {
  await ready()
  const route = data().routes.find((r) => r.id === id)
  if (!route) throw new Error('That route no longer exists.')
  route.share_token = randomToken()
  await idbPut(STORES.routes, route)
  return routeSummary(route)
}

// ------------------------------------------------------------------- landmarks

export async function addLandmark(
  routeId: number,
  input: LandmarkInput & { photo?: File | null },
): Promise<Landmark> {
  await ready()
  const store = data()
  const steps = store.landmarks.filter((l) => l.route_id === routeId)
  const record: LandmarkRecord = {
    id: await nextId(STORES.landmarks),
    route_id: routeId,
    position: steps.length,
    name: input.name,
    action: input.action,
    instruction: input.instruction,
    description: input.description ?? '',
    photo_url: input.photo ? await savePhotoBlob(input.photo) : null,
    lat: input.lat ?? null,
    lng: input.lng ?? null,
    public_landmark_id: null,
    created_at: new Date().toISOString(),
    ...initialVerification(),
  }
  store.landmarks.push(record)
  await idbPut(STORES.landmarks, record)
  return landmarkOut(record)
}

export async function updateLandmark(
  landmarkId: number,
  patch: Partial<{
    name: string
    action: LandmarkAction
    instruction: string
    description: string
    lat: number | null
    lng: number | null
  }>,
): Promise<Landmark> {
  await ready()
  const record = data().landmarks.find((l) => l.id === landmarkId)
  if (!record) throw new Error('That landmark no longer exists.')

  if (patch.name !== undefined) record.name = patch.name
  if (patch.action !== undefined) record.action = patch.action
  if (patch.instruction !== undefined) record.instruction = patch.instruction
  if (patch.description !== undefined) record.description = patch.description
  if (patch.lat !== undefined) record.lat = patch.lat
  if (patch.lng !== undefined) record.lng = patch.lng

  await idbPut(STORES.landmarks, record)
  return landmarkOut(record)
}

export async function deleteLandmark(landmarkId: number): Promise<void> {
  await ready()
  const store = data()
  const index = store.landmarks.findIndex((l) => l.id === landmarkId)
  if (index < 0) return
  const [record] = store.landmarks.splice(index, 1)
  await deletePhotoBlob(record.photo_url)
  await idbDelete(STORES.landmarks, landmarkId)
  await compactPositions(record.route_id)
}

export async function reorderLandmarks(routeId: number, landmarkIds: number[]): Promise<Landmark[]> {
  await ready()
  const store = data()
  const wanted = new Set(landmarkIds)
  for (const record of store.landmarks) {
    if (record.route_id === routeId && wanted.has(record.id)) {
      record.position = landmarkIds.indexOf(record.id)
    }
  }
  await Promise.all(
    store.landmarks
      .filter((l) => l.route_id === routeId)
      .map((l) => idbPut(STORES.landmarks, l)),
  )
  return store.landmarks
    .filter((l) => l.route_id === routeId)
    .sort((a, b) => a.position - b.position)
    .map(landmarkOut)
}

/** Renumber steps 0..n-1 so a deleted middle step leaves no gap. */
async function compactPositions(routeId: number): Promise<void> {
  const steps = data()
    .landmarks.filter((l) => l.route_id === routeId)
    .sort((a, b) => a.position - b.position)
  steps.forEach((step, index) => {
    step.position = index
  })
  await Promise.all(steps.map((s) => idbPut(STORES.landmarks, s)))
}

export async function verifyLandmark(landmarkId: number): Promise<Landmark> {
  await ready()
  const record = data().landmarks.find((l) => l.id === landmarkId)
  if (!record) throw new Error('That landmark no longer exists.')
  const now = new Date()
  record.last_verified = now.toISOString()
  record.next_verification = dueDate(now)
  await idbPut(STORES.landmarks, record)
  return landmarkOut(record)
}

export async function attachPhoto(landmarkId: number, file: File): Promise<{ photo_url: string }> {
  await ready()
  const record = data().landmarks.find((l) => l.id === landmarkId)
  if (!record) throw new Error('That landmark no longer exists.')

  const previous = record.photo_url
  record.photo_url = await savePhotoBlob(file)
  // A new photo is a fresh observation, so the clock restarts.
  const now = new Date()
  record.last_verified = now.toISOString()
  record.next_verification = dueDate(now)
  await idbPut(STORES.landmarks, record)
  if (previous && previous !== record.photo_url) await deletePhotoBlob(previous)
  return { photo_url: record.photo_url }
}

// ------------------------------------------------------------------ community

export interface PublicLandmarkFilter {
  stale?: boolean
  disputed?: boolean
  q?: string
}

export function listPublicLandmarks(filter: PublicLandmarkFilter = {}): PublicLandmark[] {
  let rows = [...data().publicLandmarks]

  if (filter.stale) rows = rows.filter((r) => isStale(r.next_verification))
  if (filter.disputed) rows = rows.filter((r) => r.is_disputed)
  if (filter.q) {
    const needle = filter.q.trim().toLowerCase()
    rows = rows.filter(
      (r) =>
        r.name.toLowerCase().includes(needle) || r.description.toLowerCase().includes(needle),
    )
  }
  return rows.sort((a, b) => b.times_used - a.times_used).map(publicLandmarkOut)
}

export function getPublicLandmark(id: number): PublicLandmark {
  const record = data().publicLandmarks.find((p) => p.id === id)
  if (!record) throw new Error('That community landmark no longer exists.')
  return publicLandmarkOut(record)
}

export async function contributePublicLandmark(input: {
  name: string
  lat: number
  lng: number
  description?: string
}): Promise<PublicLandmark> {
  await ready()
  const now = new Date()
  const record: PublicLandmarkRecord = {
    id: await nextId(STORES.publicLandmarks),
    contributor_id: LOCAL_USER_ID,
    name: input.name,
    description: input.description ?? '',
    photo_url: null,
    lat: input.lat,
    lng: input.lng,
    created_at: now.toISOString(),
    last_verified: now.toISOString(),
    next_verification: dueDate(now),
    last_verified_by_id: LOCAL_USER_ID,
    is_disputed: false,
    report_count: 0,
    times_used: 0,
  }
  data().publicLandmarks.push(record)
  await idbPut(STORES.publicLandmarks, record)
  return publicLandmarkOut(record)
}

export async function updatePublicLandmark(
  id: number,
  patch: Partial<{ name: string; description: string; lat: number; lng: number }>,
): Promise<PublicLandmark> {
  await ready()
  const record = data().publicLandmarks.find((p) => p.id === id)
  if (!record) throw new Error('That community landmark no longer exists.')
  if (patch.name !== undefined) record.name = patch.name
  if (patch.description !== undefined) record.description = patch.description
  if (patch.lat !== undefined) record.lat = patch.lat
  if (patch.lng !== undefined) record.lng = patch.lng
  await idbPut(STORES.publicLandmarks, record)
  return publicLandmarkOut(record)
}

export async function uploadPublicLandmarkPhoto(
  id: number,
  file: File,
): Promise<PublicLandmark> {
  await ready()
  const record = data().publicLandmarks.find((p) => p.id === id)
  if (!record) throw new Error('That community landmark no longer exists.')

  const previous = record.photo_url
  record.photo_url = await savePhotoBlob(file)
  // Anyone can re-photograph an outdated landmark: that is a fresh look at the
  // real world, so it restarts the contributor's validation window.
  const now = new Date()
  record.last_verified = now.toISOString()
  record.next_verification = dueDate(now)
  record.last_verified_by_id = LOCAL_USER_ID
  record.is_disputed = false
  await idbPut(STORES.publicLandmarks, record)
  if (previous && previous !== record.photo_url) await deletePhotoBlob(previous)
  return publicLandmarkOut(record)
}

export async function verifyPublicLandmark(id: number): Promise<PublicLandmark> {
  await ready()
  const record = data().publicLandmarks.find((p) => p.id === id)
  if (!record) throw new Error('That community landmark no longer exists.')
  if (record.contributor_id !== LOCAL_USER_ID) {
    throw new Error('Only the contributor can confirm this landmark')
  }
  const now = new Date()
  record.last_verified = now.toISOString()
  record.next_verification = dueDate(now)
  record.last_verified_by_id = LOCAL_USER_ID
  await idbPut(STORES.publicLandmarks, record)
  return publicLandmarkOut(record)
}

export async function reportPublicLandmark(id: number, note: string): Promise<PublicLandmark> {
  await ready()
  const store = data()
  const record = store.publicLandmarks.find((p) => p.id === id)
  if (!record) throw new Error('That community landmark no longer exists.')

  const already = store.reports.some(
    (r) => r.landmark_id === id && r.reporter_id === LOCAL_USER_ID,
  )
  if (already) return publicLandmarkOut(record)

  const report: ReportRecord = {
    id: await nextId(STORES.reports),
    landmark_id: id,
    reporter_id: LOCAL_USER_ID,
    note,
    created_at: new Date().toISOString(),
  }
  store.reports.push(report)
  await idbPut(STORES.reports, report)

  record.report_count += 1
  // Three independent reports stop the landmark being trusted.
  if (record.report_count >= 3) record.is_disputed = true
  await idbPut(STORES.publicLandmarks, record)
  return publicLandmarkOut(record)
}

export async function usePublicLandmark(id: number, routeId: number): Promise<Landmark> {
  await ready()
  const store = data()
  const source = store.publicLandmarks.find((p) => p.id === id)
  if (!source) throw new Error('That community landmark no longer exists.')

  const steps = store.landmarks.filter((l) => l.route_id === routeId)
  const last = steps.sort((a, b) => b.position - a.position)[0]
  const record: LandmarkRecord = {
    id: await nextId(STORES.landmarks),
    route_id: routeId,
    position: last ? last.position + 1 : 0,
    name: source.name,
    action: 'pass',
    instruction: `Pass the ${source.name}.`,
    description: source.description,
    // Keep the relative copy pointing at the source so a later refresh of the
    // community landmark propagates here too.
    photo_url: source.photo_url,
    lat: source.lat,
    lng: source.lng,
    public_landmark_id: source.id,
    created_at: new Date().toISOString(),
    last_verified: source.last_verified,
    next_verification: source.next_verification,
  }
  store.landmarks.push(record)
  await idbPut(STORES.landmarks, record)

  source.times_used += 1
  await idbPut(STORES.publicLandmarks, source)
  return landmarkOut(record)
}

// ---------------------------------------------------------------- verification

export function verificationSummary(): VerificationSummary {
  const store = data()
  const routeIds = new Set(
    store.routes.filter((r) => r.owner_id === LOCAL_USER_ID).map((r) => r.id),
  )
  const steps = store.landmarks.filter((l) => routeIds.has(l.route_id))
  const overdue = steps.filter((l) => isStale(l.next_verification)).length
  const dueSoon = steps.filter((l) => isDueSoon(l.next_verification)).length
  return {
    total_routes: routeIds.size,
    total_landmarks: steps.length,
    verified: steps.length - overdue,
    due_soon: dueSoon,
    overdue,
  }
}

export function dueLandmarks(): DueLandmark[] {
  const store = data()
  const titles = new Map(store.routes.map((r) => [r.id, r.title]))
  const routeIds = new Set(
    store.routes.filter((r) => r.owner_id === LOCAL_USER_ID).map((r) => r.id),
  )
  return store.landmarks
    .filter(
      (l) =>
        routeIds.has(l.route_id) &&
        (isStale(l.next_verification) || isDueSoon(l.next_verification)),
    )
    .sort((a, b) => (a.next_verification ?? '').localeCompare(b.next_verification ?? ''))
    .map((l) => ({
      ...landmarkOut(l),
      route_title: titles.get(l.route_id) ?? 'Untitled route',
      days_until_due: daysUntilDue(l.next_verification),
      status: statusOf(l.next_verification),
    }))
}

// ----------------------------------------------------------------- share data

export interface SharedRoute {
  title: string
  destination_name: string
  destination_address: string
  destination_lat: number
  destination_lng: number
  share_url: string
  last_updated: string
  landmarks: Landmark[]
}

export function getSharedRoute(token: string): SharedRoute | null {
  const route = data().routes.find((r) => r.share_token === token)
  if (!route || !route.is_published) return null
  return {
    title: route.title,
    destination_name: route.destination_name,
    destination_address: route.destination_address,
    destination_lat: route.destination_lat,
    destination_lng: route.destination_lng,
    share_url: shareUrlFor(token),
    last_updated: route.updated_at,
    landmarks: getRoute(route.id).landmarks,
  }
}

/** Wipe everything and rebuild the demo content. Exposed in the UI as a reset. */
export async function resetAll(): Promise<void> {
  cache = null
  await idbWipe()
  await ready()
}

// ---------------------------------------------------------------------- seed

const KHI = { lat: 24.9155118, lng: 67.0924559 }

const SEED_ROUTES: Array<{
  title: string
  destination_name: string
  destination_address: string
  steps: Array<[string, LandmarkAction, string, string, number, number]>
}> = [
  {
    title: 'Coaching centre to Sir Syed University',
    destination_name: 'Sir Syed University of Engineering & Technology',
    destination_address: 'University Road, Gulshan-e-Iqbal Block 9, Karachi',
    steps: [
      [
        'Coaching Centre Front Gate',
        'start',
        'Start from the coaching centre gate on the main road.',
        'The landmark the route is measured from.',
        0,
        0,
      ],
      [
        'Main University Road Junction',
        'pass',
        'Continue onto University Road towards Gulshan-e-Iqbal.',
        'Wide four-lane road; buses and rickshaws converge here.',
        0.0022,
        0.0015,
      ],
      [
        'Sir Syed University Outer Wall',
        'continue',
        'Continue until the university wall runs along your right.',
        'Long cream boundary wall with the campus name in green.',
        0.0009,
        0.0006,
      ],
      [
        'Main Entrance',
        'destination',
        'The main entrance is on your right, opposite the bus stop.',
        'Look for the gate directly across from the marked bus stop.',
        0,
        0,
      ],
    ],
  },
  {
    title: 'Green Shop to Blue Water Tank',
    destination_name: 'Blue Water Tank',
    destination_address: 'Gulshan-e-Iqbal, Karachi',
    steps: [
      [
        'Green Shop',
        'pass',
        'Pass the green shop on the corner.',
        'Distinctive green frontage, easy to spot from the road.',
        0.0012,
        -0.0008,
      ],
      [
        'Blue Water Tank',
        'continue',
        'Continue until the blue water tank comes into view.',
        'Large tank on a concrete platform, visible from far away.',
        0.0004,
        0.0009,
      ],
      [
        'Destination',
        'destination',
        'The destination is opposite the blue water tank.',
        'Look for the marked entrance across the road.',
        0,
        0,
      ],
    ],
  },
]

const SEED_LIBRARY: Array<[string, string, number, number, number]> = [
  ['Green Pharmacy', 'Green shopfront with a white cross, opposite the mosque.', 0.0009, -0.0006, 150],
  ['Blue Water Tank', 'Large blue tank on a concrete platform, visible from the main road.', -0.0011, 0.0007, 12],
  ['Old Post Office', 'Red-brick single-storey building with a faded Pakistan Post sign.', 0.0016, 0.0011, -20],
]

/**
 * Populate the demo content on first run.
 *
 * With no server, "first run" means an empty IndexedDB in this browser. A judge
 * who has never used the app must still land on a populated dashboard, so the
 * same two sample routes the backend used to seed are built here.
 */
async function ensureSeeded(): Promise<void> {
  const store = data()
  if (store.routes.length > 0 || store.publicLandmarks.length > 0) return

  const now = new Date()
  const verified = { last_verified: now.toISOString(), next_verification: dueDate(now) }

  for (const seed of SEED_ROUTES) {
    const route: RouteRecord = {
      id: await nextId(STORES.routes),
      owner_id: LOCAL_USER_ID,
      title: seed.title,
      destination_name: seed.destination_name,
      destination_address: seed.destination_address,
      destination_lat: KHI.lat,
      destination_lng: KHI.lng,
      share_token: randomToken(),
      is_published: true,
      created_at: now.toISOString(),
      updated_at: now.toISOString(),
    }
    store.routes.push(route)
    await idbPut(STORES.routes, route)

    // Sequential on purpose: an async forEach would not be awaited, so the
    // steps could still be in flight when ready() resolved and a judge would
    // briefly see a route with no landmarks.
    for (const [index, [name, action, instruction, description, dlat, dlng]] of
      seed.steps.entries()) {
      const step: LandmarkRecord = {
        id: await nextId(STORES.landmarks),
        route_id: route.id,
        position: index,
        name,
        action,
        instruction,
        description,
        photo_url: null,
        lat: KHI.lat + dlat,
        lng: KHI.lng + dlng,
        public_landmark_id: null,
        created_at: now.toISOString(),
        ...verified,
      }
      store.landmarks.push(step)
      await idbPut(STORES.landmarks, step)
    }
  }

  for (const [name, description, dlat, dlng, dueInDays] of SEED_LIBRARY) {
    const record: PublicLandmarkRecord = {
      id: await nextId(STORES.publicLandmarks),
      contributor_id: LOCAL_USER_ID,
      name,
      description,
      photo_url: null,
      lat: KHI.lat + dlat,
      lng: KHI.lng + dlng,
      created_at: now.toISOString(),
      last_verified: now.toISOString(),
      // Deliberately mixed, so the six-month re-check worklist has something in
      // every state on first load: one overdue, one due soon, one comfortable.
      next_verification: new Date(now.getTime() + dueInDays * 86_400_000).toISOString(),
      last_verified_by_id: LOCAL_USER_ID,
      is_disputed: false,
      report_count: 0,
      times_used: 0,
    }
    store.publicLandmarks.push(record)
    await idbPut(STORES.publicLandmarks, record)
  }
}
