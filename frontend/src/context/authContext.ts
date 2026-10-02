import { createContext } from 'react'

import type { User } from '../api/types'

export interface Credentials {
  email: string
  password: string
}

export interface Registration extends Credentials {
  name: string
}

export interface AuthValue {
  /** The signed-in account, or null when signed out. */
  user: User | null
  /** True until the stored token has been checked against the server. */
  loading: boolean
  /**
   * Set when the session could not be established at all — the server is
   * unreachable, rather than the user simply being signed out.
   */
  error: string

  /** Resolves to the signed-in user, or throws an `ApiError` on bad input. */
  login: (credentials: Credentials) => Promise<User>
  register: (input: Registration) => Promise<User>
  /** The seeded demo account, with no credentials to type. */
  demoLogin: () => Promise<User>
  logout: () => void
}

export const AuthContext = createContext<AuthValue | null>(null)