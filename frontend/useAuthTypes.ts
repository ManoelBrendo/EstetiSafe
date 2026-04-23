import type { AuthUser } from './types'

export interface AuthContextValue {
  user: AuthUser | null
  login: (email: string, password: string) => Promise<AuthUser>
  register: (email: string, password: string, clinicName: string) => Promise<AuthUser>
  logout: () => void
  refreshUser: () => Promise<AuthUser | null>
  assumeClinic: (targetUserId: number) => Promise<AuthUser>
  returnToSupport: () => AuthUser
  isReady: boolean
  isAuth: boolean
  isSupport: boolean
  hasSupportSession: boolean
}

export interface AuthSessionResponse {
  token: string
  user: AuthUser
}

export type { AuthUser } from './types'
