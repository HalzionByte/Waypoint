import { createContext } from 'react'

import type { User } from '../api/types'

export interface AuthValue {
  /** Always set once loading finishes — this app has no sign-in step. */
  user: User | null
  loading: boolean
}

export const AuthContext = createContext<AuthValue | null>(null)
