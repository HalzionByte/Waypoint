// The shapes the browser-side data layer returns. These used to mirror the
// FastAPI schemas in backend/app/schemas.py and still do, so the two can be
// diffed against each other if a server is ever brought back.

export type LandmarkAction =
  | 'start'
  | 'pass'
  | 'continue'
  | 'turn_left'
  | 'turn_right'
  | 'turn_back'
  | 'enter'
  | 'exit'
  | 'cross'
  | 'destination'
  | 'other'

export interface User {
  id: number
  name: string
  email: string
  created_at: string
}

export interface Landmark {
  id: number
  route_id: number
  position: number
  name: string
  photo_url: string | null
  lat: number | null
  lng: number | null
  instruction: string
  description: string
  action: LandmarkAction
  created_at: string
  last_verified: string | null
  next_verification: string | null
  is_stale: boolean
  /** Set when this step reuses a landmark from the community library. */
  public_landmark_id: number | null
}

export interface LandmarkCounts {
  total: number
  verified: number
  stale: number
}

export interface RouteSummary {
  id: number
  owner_id: number
  title: string
  destination_name: string
  destination_address: string
  destination_lat: number
  destination_lng: number
  share_token: string
  share_url: string
  is_published: boolean
  created_at: string
  updated_at: string
  landmark_counts: LandmarkCounts
}

export interface RouteDetail extends RouteSummary {
  landmarks: Landmark[]
}

export interface PublicRoute {
  title: string
  destination_name: string
  destination_address: string
  destination_lat: number
  destination_lng: number
  share_url: string
  last_updated: string
  landmarks: Landmark[]
}

export interface VerificationSummary {
  total_routes: number
  total_landmarks: number
  verified: number
  due_soon: number
  overdue: number
}

export interface DueLandmark extends Landmark {
  route_title: string
  days_until_due: number | null
  status: 'verified' | 'due_soon' | 'overdue'
}

export interface RouteInput {
  title: string
  destination_name?: string
  destination_address?: string
  destination_lat: number
  destination_lng: number
}

export interface LandmarkInput {
  name: string
  action: LandmarkAction
  instruction: string
  description?: string
  photo_url?: string | null
  lat?: number | null
  lng?: number | null
}

/* ------------------------------------------------------------------ community */

export interface PublicLandmark {
  id: number
  name: string
  photo_url: string | null
  lat: number
  lng: number
  description: string

  contributor_id: number
  contributor_name: string
  last_verified_by: string | null

  created_at: string
  last_verified: string | null
  next_verification: string | null
  is_stale: boolean

  is_disputed: boolean
  report_count: number
  times_used: number

  /** What the signed-in viewer is allowed to do with this landmark. */
  is_mine: boolean
  can_verify: boolean
  reported_by_me: boolean
}

export interface PublicLandmarkInput {
  name: string
  lat: number
  lng: number
  description?: string
}
