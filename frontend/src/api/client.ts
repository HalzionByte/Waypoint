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
import * as store from '../lib/store'
import { readSharePayload } from '../lib/share'

/**
 * The data API, served by this browser.
 *
 * Every function keeps the signature and the return shape it had when a FastAPI
 * backend served it, so the pages did not have to change. Two deliberate
 * differences: there is no auth of any kind, and the shared view falls back to
 * the link's own payload, because with no server a token cannot be looked up on
 * a device that never saw the route.
 */

export class ApiError extends Error {
  status: number
  constructor(status: number, message: string) {
    super(message)
    this.status = status
    this.name = 'ApiError'
  }
}

/**
 * Store operations are synchronous once ready(), so a read is turned into a
 * resolved promise for shape-compatibility. Writes stay genuinely async.
 */
function read<T>(fn: () => T): Promise<T> {
  return store.ready().then(fn)
}

/** Anything the store throws is a user-facing condition, not a crash. */
function guard<T>(fn: () => Promise<T>): Promise<T> {
  return fn().catch((err: unknown) => {
    if (err instanceof ApiError) throw err
    const message = err instanceof Error ? err.message : String(err)
    throw new ApiError(400, message)
  })
}

export const api = {
  me: (): Promise<User> => read(() => store.LOCAL_USER),

  /**
   * There is no sign-in form, so this is only kept for the boot path: open the
   * database and, on first run, build the demo content.
   */
  demoLogin: (): Promise<{ user: User }> => read(() => ({ user: store.LOCAL_USER })),

  listRoutes: (): Promise<RouteSummary[]> => read(() => store.listRoutes()),
  createRoute: (input: RouteInput): Promise<RouteDetail> => guard(() => store.createRoute(input)),
  getRoute: (id: number): Promise<RouteDetail> =>
    read(() => {
      try {
        return store.getRoute(id)
      } catch {
        throw new ApiError(404, 'That route no longer exists.')
      }
    }),
  updateRoute: (
    id: number,
    input: Partial<RouteInput> & { is_published?: boolean },
  ): Promise<RouteDetail> => guard(() => store.updateRoute(id, input)),
  deleteRoute: (id: number): Promise<void> => guard(() => store.deleteRoute(id)),
  rotateShareToken: (id: number): Promise<RouteSummary> =>
    guard(() => store.rotateShareToken(id)),

  addLandmark: (routeId: number, input: LandmarkInput & { photo?: File | null }) =>
    guard(() => store.addLandmark(routeId, input)),
  updateLandmark: (landmarkId: number, input: Partial<LandmarkInput>) =>
    guard(() => store.updateLandmark(landmarkId, input)),
  deleteLandmark: (landmarkId: number): Promise<void> =>
    guard(() => store.deleteLandmark(landmarkId)),
  reorderLandmarks: (routeId: number, landmarkIds: number[]): Promise<Landmark[]> =>
    guard(() => store.reorderLandmarks(routeId, landmarkIds)),
  verifyLandmark: (landmarkId: number): Promise<Landmark> =>
    guard(() => store.verifyLandmark(landmarkId)),
  uploadPhoto: (landmarkId: number, file: File): Promise<{ photo_url: string }> =>
    guard(() => store.attachPhoto(landmarkId, file)),

  verificationSummary: (): Promise<VerificationSummary> => read(() => store.verificationSummary()),
  dueLandmarks: (): Promise<DueLandmark[]> => read(() => store.dueLandmarks()),

  // ---------------------------------------------------------------- community
  listPublicLandmarks: (
    params: { stale?: boolean; disputed?: boolean; q?: string } = {},
  ): Promise<PublicLandmark[]> => read(() => store.listPublicLandmarks(params)),

  getPublicLandmark: (id: number): Promise<PublicLandmark> =>
    read(() => {
      try {
        return store.getPublicLandmark(id)
      } catch {
        throw new ApiError(404, 'That community landmark no longer exists.')
      }
    }),

  contribute: (input: PublicLandmarkInput): Promise<PublicLandmark> =>
    guard(() => store.contributePublicLandmark(input)),

  updatePublicLandmark: (
    id: number,
    input: Partial<PublicLandmarkInput>,
  ): Promise<PublicLandmark> => guard(() => store.updatePublicLandmark(id, input)),

  uploadPublicLandmarkPhoto: (id: number, file: File): Promise<PublicLandmark> =>
    guard(() => store.uploadPublicLandmarkPhoto(id, file)),

  verifyPublicLandmark: (id: number): Promise<PublicLandmark> =>
    guard(() => store.verifyPublicLandmark(id)),

  reportPublicLandmark: (id: number, note: string): Promise<PublicLandmark> =>
    guard(() => store.reportPublicLandmark(id, note)),

  usePublicLandmark: (id: number, routeId: number): Promise<Landmark> =>
    guard(() => store.usePublicLandmark(id, routeId)),

  /**
   * The recipient view. Looks in this browser's data first, then falls back to
   * the payload carried by the link itself, which is what makes a shared link
   * work on a device that has never seen the route.
   */
  publicRoute: (token: string): Promise<PublicRoute> =>
    read(() => {
      const local = store.getSharedRoute(token)
      if (local) return local

      const packed = readSharePayload(window.location.hash)
      if (packed) {
        return {
          ...packed,
          share_url: store.shareUrlFor(token),
          last_updated: new Date().toISOString(),
        }
      }

      throw new ApiError(
        404,
        'This link is not stored in this browser. Open it on the device that created it, or ask for the link to be sent again.',
      )
    }),
}

/** QR codes are drawn in the browser now; see `qrDataUrl`. */
export const publicQrUrl = (token: string): string => store.shareUrlFor(token)
