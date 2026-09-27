import { createContext } from 'react'

import type { User } from '../api/types'

export interface AuthValue {
  user: User | null
  loading: boolean
  login: (email: string, password: string) => Promise<void>
  register: (name: string, email: string, password: string) => Promise<void>
  /** One-click sign-in as the shared demo account. Rejects if unavailable. */
  enterDemo: () => Promise<void>
  logout: () => void
  /** True when signed in as the shared demo account rather than a real one. */
  isDemo: boolean
}

export const AuthContext = createContext<AuthValue | null>(null)
