import { useContext } from 'react'

import { AuthContext } from './authContext'
import type { AuthValue } from './authContext'

export function useAuth(): AuthValue {
  const context = useContext(AuthContext)
  if (!context) throw new Error('useAuth must be used inside <AuthProvider>')
  return context
}
