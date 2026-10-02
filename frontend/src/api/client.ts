import type {
  DueLandmark,
  Landmark,
  LandmarkInput,
  PublicLandmark,
  PublicLandmarkInput,
  PublicRoute,
  RouteDetail,
  RouteInput,
  RouteSummary,
  User,
  VerificationSummary,
} from './types'
import {
  ApiError,
  clearToken,
  query,
  request,
  setToken,
  upload,
} from '../lib/http'

/**
 * The data API.
 *
 * Every function keeps the signature and the return shape it had when the
 * browser's own IndexedDB served this app, so the pages did not have to change.
 * The server is now the single source of truth: nothing is cached locally, and
 * a shared link is resolved by its token rather than carrying its own payload.
 *
 * Endpoints map one-to-one onto `backend/app/routers/*`, all under `api_prefix`
 * (`/api` by default).
 */

const P = '/api'

/** What `/auth/login`, `/auth/register` and `/auth/demo` return. */
interface TokenResponse {
  access_token: string
  token_type: string
  user: User
}

/** Store the token and hand back the user, so callers only deal with one shape. */
function acceptSession(session: TokenResponse): User {
  setToken(session.access_token)
  return session.user
}

export const api = {
  /* ------------------------------------------------------------------- auth */
  me: (): Promise<User> => request<User>(`${P}/auth/me`),

  login: (email: string, password: string): Promise<User> =>
    request<TokenResponse>(`${P}/auth/login`, {
      method: 'POST',
      body: { email: email.trim(), password },
      anonymous: true,
    }).then(acceptSession),

  register: (input: { name: string; email: string; password: string }): Promise<User> =>
    request<TokenResponse>(`${P}/auth/register`, {
      method: 'POST',
      body: { name: input.name.trim(), email: input.email.trim(), password: input.password },
      anonymous: true,
    }).then(acceptSession),

  /**
   * Sign in as the seeded demo account without typing anything, so the app is
   * still one click away from working. The server can switch this off
   * (`DEMO_AUTO_LOGIN=false`), in which case this is a 404.
   */
  demoLogin: (): Promise<User> =>
    request<TokenResponse>(`${P}/auth/demo`, { method: 'POST', anonymous: true }).then(
      acceptSession,
    ),

  logout: (): void => clearToken(),

  /* ----------------------------------------------------------------- routes */
  listRoutes: (): Promise<RouteSummary[]> => request<RouteSummary[]>(`${P}/routes`),

  createRoute: (input: RouteInput): Promise<RouteDetail> =>
    request<RouteDetail>(`${P}/routes`, { method: 'POST', body: input }),

  getRoute: (id: number): Promise<RouteDetail> => request<RouteDetail>(`${P}/routes/${id}`),

  updateRoute: (
    id: number,
    input: Partial<RouteInput> & { is_published?: boolean },
  ): Promise<RouteDetail> => request<RouteDetail>(`${P}/routes/${id}`, { method: 'PATCH', body: input }),

  deleteRoute: (id: number): Promise<void> =>
    request<void>(`${P}/routes/${id}`, { method: 'DELETE' }),

  rotateShareToken: (id: number): Promise<RouteSummary> =>
    request<RouteSummary>(`${P}/routes/${id}/share/rotate`, { method: 'POST' }),

  /* -------------------------------------------------------------- landmarks */
  addLandmark: (routeId: number, input: LandmarkInput): Promise<Landmark> =>
    request<Landmark>(`${P}/routes/${routeId}/landmarks`, { method: 'POST', body: input }),

  updateLandmark: (landmarkId: number, input: Partial<LandmarkInput>): Promise<Landmark> =>
    request<Landmark>(`${P}/landmarks/${landmarkId}`, { method: 'PATCH', body: input }),

  deleteLandmark: (landmarkId: number): Promise<void> =>
    request<void>(`${P}/landmarks/${landmarkId}`, { method: 'DELETE' }),

  reorderLandmarks: (routeId: number, landmarkIds: number[]): Promise<Landmark[]> =>
    request<Landmark[]>(`${P}/routes/${routeId}/landmarks/order`, {
      method: 'PUT',
      body: { landmark_ids: landmarkIds },
    }),

  verifyLandmark: (landmarkId: number): Promise<Landmark> =>
    request<Landmark>(`${P}/landmarks/${landmarkId}/verify`, { method: 'POST' }),

  uploadPhoto: (landmarkId: number, file: File): Promise<{ photo_url: string }> =>
    upload<{ photo_url: string }>(`${P}/landmarks/${landmarkId}/photo`, file),

  /* ----------------------------------------------------------- verification */
  verificationSummary: (): Promise<VerificationSummary> =>
    request<VerificationSummary>(`${P}/verification/summary`),

  dueLandmarks: (): Promise<DueLandmark[]> => request<DueLandmark[]>(`${P}/verification/due`),

  /* ---------------------------------------------------------------- community */
  listPublicLandmarks: (
    params: { stale?: boolean; disputed?: boolean; q?: string } = {},
  ): Promise<PublicLandmark[]> =>
    request<PublicLandmark[]>(`${P}/public-landmarks${query(params)}`),

  getPublicLandmark: (id: number): Promise<PublicLandmark> =>
    request<PublicLandmark>(`${P}/public-landmarks/${id}`),

  contribute: (input: PublicLandmarkInput): Promise<PublicLandmark> =>
    request<PublicLandmark>(`${P}/public-landmarks`, { method: 'POST', body: input }),

  updatePublicLandmark: (
    id: number,
    input: Partial<PublicLandmarkInput>,
  ): Promise<PublicLandmark> =>
    request<PublicLandmark>(`${P}/public-landmarks/${id}`, { method: 'PATCH', body: input }),

  uploadPublicLandmarkPhoto: (id: number, file: File): Promise<PublicLandmark> =>
    upload<PublicLandmark>(`${P}/public-landmarks/${id}/photo`, file),

  verifyPublicLandmark: (id: number): Promise<PublicLandmark> =>
    request<PublicLandmark>(`${P}/public-landmarks/${id}/verify`, { method: 'POST' }),

  reportPublicLandmark: (id: number, note: string): Promise<PublicLandmark> =>
    request<PublicLandmark>(`${P}/public-landmarks/${id}/report`, {
      method: 'POST',
      body: { note },
    }),

  usePublicLandmark: (id: number, routeId: number): Promise<Landmark> =>
    request<Landmark>(`${P}/public-landmarks/${id}/use`, {
      method: 'POST',
      body: { route_id: routeId },
    }),

  /* ------------------------------------------------------------------ public */
  /**
   * The recipient view. Anonymous by design — someone following a shared link
   * has no account and must not be asked for one. The route comes from the
   * server by token, which is what finally makes photos travel with the link.
   */
  publicRoute: (token: string): Promise<PublicRoute> =>
    request<PublicRoute>(`${P}/public/routes/${encodeURIComponent(token)}`, { anonymous: true }),
}

export { ApiError }