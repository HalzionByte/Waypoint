/**
 * The one place that talks to the WayPoint API.
 *
 * Everything above this file works in plain objects and promises, so the data
 * source is swappable behind it. That was true when the browser's own IndexedDB
 * served the app and it is true now that FastAPI does.
 *
 * ## Where the API lives
 *
 * `VITE_API_BASE_URL` is the API's origin, and it is deliberately empty by
 * default. That makes every request same-origin, which is correct for both
 * supported deploys:
 *
 *  - **dev** — Vite proxies `/api` and `/uploads` to 127.0.0.1:8000 (see
 *    `vite.config.ts`), so the browser never makes a cross-origin request.
 *  - **single container** — FastAPI serves the built SPA from the same origin.
 *
 * Only a split deploy (site on Vercel, API on Render/Railway/Fly) needs this
 * set to the API's absolute origin. Setting it in the other two cases is
 * harmless but unnecessary, and getting it wrong is the single most common
 * cause of "the site loads but shows no data".
 */

const RAW_BASE = import.meta.env.VITE_API_BASE_URL ?? ''

/** No trailing slash, so `${API_BASE}${path}` is always well formed. */
export const API_BASE = RAW_BASE.replace(/\/+$/, '')

const TOKEN_KEY = 'waypoint.token'

/** A failed request, carrying the status so callers can branch on 401/404. */
export class ApiError extends Error {
  status: number

  constructor(status: number, message: string) {
    super(message)
    this.name = 'ApiError'
    this.status = status
  }
}

/* ------------------------------------------------------------------- the token */

export function getToken(): string | null {
  try {
    return localStorage.getItem(TOKEN_KEY)
  } catch {
    // Private mode / blocked site data. Treated as "signed out" rather than a
    // crash; the login page will fail on its own with a readable message.
    return null
  }
}

export function setToken(token: string): void {
  try {
    localStorage.setItem(TOKEN_KEY, token)
  } catch {
    /* No storage, no session. The API will 401 on the next call. */
  }
}

export function clearToken(): void {
  try {
    localStorage.removeItem(TOKEN_KEY)
  } catch {
    /* nothing to do */
  }
}

/** Called when the server rejects our token, so the UI can drop to signed-out. */
type UnauthorizedHandler = () => void
let onUnauthorized: UnauthorizedHandler | null = null

export function setUnauthorizedHandler(handler: UnauthorizedHandler | null): void {
  onUnauthorized = handler
}

/* --------------------------------------------------------------------- errors */

/**
 * FastAPI reports problems two ways: a human string for HTTPException, and an
 * array of {loc, msg} for request-validation failures (422). Both are flattened
 * into one sentence, because a raw validation object shown to a person asking
 * "why did my sign-up fail?" is worse than no message at all.
 */
function messageFromBody(body: unknown, status: number): string {
  const fallback = `Something went wrong (${status}).`

  if (typeof body !== 'object' || body === null) return fallback
  const detail = (body as { detail?: unknown }).detail
  if (typeof detail === 'string' && detail.trim()) return detail

  if (Array.isArray(detail)) {
    const parts = detail
      .map((item) => {
        if (typeof item === 'string') return item
        if (typeof item !== 'object' || item === null) return null
        const { msg, loc } = item as { msg?: unknown; loc?: unknown }
        if (typeof msg !== 'string') return null
        // loc is like ["body", "email"]; the field name is what a person needs.
        const field = Array.isArray(loc) ? loc[loc.length - 1] : null
        return typeof field === 'string' && field !== 'body'
          ? `${field}: ${msg}`
          : msg
      })
      .filter((p): p is string => Boolean(p))

    if (parts.length) return parts.join(' ')
  }

  return fallback
}

const NETWORK_ERROR =
  'Could not reach the WayPoint server. Check your connection and try again.'

/* -------------------------------------------------------------------- requests */

interface RequestOptions {
  method?: string
  /** Serialised as a JSON body unless it is already FormData. */
  body?: unknown
  /** Sent without the Authorization header — the public route view and login. */
  anonymous?: boolean
  signal?: AbortSignal
}

async function send<T>(path: string, options: RequestOptions): Promise<T> {
  const { method = 'GET', body, anonymous = false, signal } = options

  const headers: Record<string, string> = {}
  const token = getToken()
  if (!anonymous && token) headers.Authorization = `Bearer ${token}`

  let payload: BodyInit | undefined
  if (body instanceof FormData) {
    // No Content-Type: the browser must set it with the multipart boundary.
    payload = body
  } else if (body !== undefined) {
    headers['Content-Type'] = 'application/json'
    payload = JSON.stringify(body)
  }

  let response: Response
  try {
    response = await fetch(`${API_BASE}${path}`, { method, headers, body: payload, signal })
  } catch (err) {
    // An aborted request is the caller's own doing, so pass it through rather
    // than dressing it up as a connectivity problem.
    if (err instanceof DOMException && err.name === 'AbortError') throw err
    throw new ApiError(0, NETWORK_ERROR)
  }

  if (response.status === 204) return undefined as T

  const text = await response.text()
  let parsed: unknown = null
  if (text) {
    try {
      parsed = JSON.parse(text)
    } catch {
      parsed = null
    }
  }

  if (!response.ok) {
    // A rejected token is not a per-request failure to show; it means the
    // session is over, so clear it once and let the app render signed-out.
    if (response.status === 401 && !anonymous) {
      clearToken()
      onUnauthorized?.()
    }
    throw new ApiError(response.status, messageFromBody(parsed, response.status))
  }

  return parsed as T
}

/** JSON request. */
export function request<T>(path: string, options: RequestOptions = {}): Promise<T> {
  return send<T>(path, options)
}

/**
 * Multipart upload. The backend names the field `file`, and it is the only
 * endpoint that takes binary rather than JSON.
 */
export function upload<T>(path: string, file: File, extra?: Record<string, string>): Promise<T> {
  const form = new FormData()
  form.append('file', file)
  if (extra) {
    for (const [key, value] of Object.entries(extra)) form.append(key, value)
  }
  return send<T>(path, { method: 'POST', body: form })
}

/* -------------------------------------------------------------------- helpers */

/** Builds `?a=1&b=2`, dropping empty values so they are not sent as blanks. */
export function query(params: Record<string, string | number | boolean | undefined>): string {
  const search = new URLSearchParams()
  for (const [key, value] of Object.entries(params)) {
    if (value === undefined || value === '' || value === null) continue
    search.set(key, String(value))
  }
  const text = search.toString()
  return text ? `?${text}` : ''
}