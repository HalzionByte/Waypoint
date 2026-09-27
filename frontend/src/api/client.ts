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
  TokenResponse,
  User,
  VerificationSummary,
} from './types'

/**
 * In dev, Vite proxies /api to the FastAPI server. In a single-container
 * deploy the same origin serves both, so a relative path is right there too.
 * VITE_API_BASE is only needed for a split setup (frontend on one host, API
 * on another).
 */
const API_BASE = (import.meta.env.VITE_API_BASE ?? '').replace(/\/$/, '')

const TOKEN_KEY = 'waypoint.token'

export function getToken(): string | null {
  return localStorage.getItem(TOKEN_KEY)
}

export function setToken(token: string | null): void {
  if (token) localStorage.setItem(TOKEN_KEY, token)
  else localStorage.removeItem(TOKEN_KEY)
}

export class ApiError extends Error {
  status: number
  constructor(status: number, message: string) {
    super(message)
    this.status = status
    this.name = 'ApiError'
  }
}

type RequestOptions = {
  method?: string
  body?: unknown
  auth?: boolean
  formData?: FormData
}

async function request<T>(path: string, options: RequestOptions = {}): Promise<T> {
  const { method = 'GET', body, auth = true, formData } = options
  const headers: Record<string, string> = {}
  if (auth) {
    const token = getToken()
    if (token) headers.Authorization = `Bearer ${token}`
  }
  if (body !== undefined) headers['Content-Type'] = 'application/json'

  const response = await fetch(`${API_BASE}/api${path}`, {
    method,
    headers,
    body: formData ?? (body !== undefined ? JSON.stringify(body) : undefined),
  })

  if (response.status === 204) return undefined as T

  const isJson = response.headers.get('content-type')?.includes('application/json')
  const payload = isJson ? await response.json() : null

  if (!response.ok) {
    // FastAPI validation errors arrive as { detail: [...] }.
    const detail = payload?.detail
    const message = Array.isArray(detail)
      ? detail.map((d: { msg?: string }) => d.msg).filter(Boolean).join('; ')
      : (detail ?? `Request failed (${response.status})`)
    if (response.status === 401) setToken(null)
    throw new ApiError(response.status, message)
  }

  return payload as T
}

export const api = {
  register: (name: string, email: string, password: string) =>
    request<TokenResponse>('/auth/register', {
      method: 'POST',
      body: { name, email, password },
      auth: false,
    }),

  login: (email: string, password: string) =>
    request<TokenResponse>('/auth/login', {
      method: 'POST',
      body: { email, password },
      auth: false,
    }),

  me: () => request<User>('/auth/me'),

  /**
   * Sign in as the shared demo account. 404s when the deployment has demo
   * login turned off, which callers treat as "no demo here".
   */
  demoLogin: () => request<TokenResponse>('/auth/demo', { method: 'POST', auth: false }),

  listRoutes: () => request<RouteSummary[]>('/routes'),
  createRoute: (input: RouteInput) =>
    request<RouteDetail>('/routes', { method: 'POST', body: input }),
  getRoute: (id: number) => request<RouteDetail>(`/routes/${id}`),
  updateRoute: (id: number, input: Partial<RouteInput> & { is_published?: boolean }) =>
    request<RouteDetail>(`/routes/${id}`, { method: 'PATCH', body: input }),
  deleteRoute: (id: number) => request<void>(`/routes/${id}`, { method: 'DELETE' }),
  rotateShareToken: (id: number) =>
    request<RouteSummary>(`/routes/${id}/share/rotate`, { method: 'POST' }),

  addLandmark: (routeId: number, input: LandmarkInput) =>
    request<Landmark>(`/routes/${routeId}/landmarks`, { method: 'POST', body: input }),
  updateLandmark: (landmarkId: number, input: Partial<LandmarkInput>) =>
    request<Landmark>(`/landmarks/${landmarkId}`, { method: 'PATCH', body: input }),
  deleteLandmark: (landmarkId: number) =>
    request<void>(`/landmarks/${landmarkId}`, { method: 'DELETE' }),
  reorderLandmarks: (routeId: number, landmarkIds: number[]) =>
    request<Landmark[]>(`/routes/${routeId}/landmarks/order`, {
      method: 'PUT',
      body: { landmark_ids: landmarkIds },
    }),
  verifyLandmark: (landmarkId: number) =>
    request<Landmark>(`/landmarks/${landmarkId}/verify`, { method: 'POST' }),
  uploadPhoto: (landmarkId: number, file: File) => {
    const formData = new FormData()
    formData.append('file', file)
    return request<{ photo_url: string }>(`/landmarks/${landmarkId}/photo`, {
      method: 'POST',
      formData,
    })
  },

  verificationSummary: () => request<VerificationSummary>('/verification/summary'),
  dueLandmarks: () => request<DueLandmark[]>('/verification/due'),

  // ---------------------------------------------------------------- community
  listPublicLandmarks: (params: {
    stale?: boolean
    disputed?: boolean
    q?: string
  } = {}) => {
    const query = new URLSearchParams()
    if (params.stale !== undefined) query.set('stale', String(params.stale))
    if (params.disputed !== undefined) query.set('disputed', String(params.disputed))
    if (params.q) query.set('q', params.q)
    const suffix = query.toString()
    return request<PublicLandmark[]>(`/public-landmarks${suffix ? `?${suffix}` : ''}`)
  },

  getPublicLandmark: (id: number) => request<PublicLandmark>(`/public-landmarks/${id}`),

  contribute: (input: PublicLandmarkInput) =>
    request<PublicLandmark>('/public-landmarks', { method: 'POST', body: input }),

  updatePublicLandmark: (id: number, input: Partial<PublicLandmarkInput>) =>
    request<PublicLandmark>(`/public-landmarks/${id}`, { method: 'PATCH', body: input }),

  uploadPublicLandmarkPhoto: (id: number, file: File) => {
    const formData = new FormData()
    formData.append('file', file)
    return request<PublicLandmark>(`/public-landmarks/${id}/photo`, {
      method: 'POST',
      formData,
    })
  },

  verifyPublicLandmark: (id: number) =>
    request<PublicLandmark>(`/public-landmarks/${id}/verify`, { method: 'POST' }),

  reportPublicLandmark: (id: number, note: string) =>
    request<PublicLandmark>(`/public-landmarks/${id}/report`, {
      method: 'POST',
      body: { note },
    }),

  usePublicLandmark: (id: number, routeId: number) =>
    request<Landmark>(`/public-landmarks/${id}/use`, {
      method: 'POST',
      body: { route_id: routeId },
    }),

  publicRoute: (token: string) =>
    request<PublicRoute>(`/public/routes/${token}`, { auth: false }),
}

/** Token-scoped so it works in an <img> tag (no Authorization header possible). */
export const publicQrUrl = (token: string) => `${API_BASE}/api/public/routes/${token}/qr`
