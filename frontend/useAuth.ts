import { createContext, createElement, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react'
import api, { authStorage } from './api'
import { isSupportUser } from './support'
import type { AuthContextValue, AuthSessionResponse, AuthUser } from './useAuthTypes'

const AuthContext = createContext<AuthContextValue | null>(null)

interface AuthProviderProps {
  children: ReactNode
}

interface PersistSessionInput {
  token: string
  user: AuthUser
  clearSupportSession?: boolean
}

export function AuthProvider({ children }: AuthProviderProps) {
  const [user, setUser] = useState<AuthUser | null>(() => authStorage.getUser())
  const [isReady, setIsReady] = useState(false)
  const [sessionRevision, setSessionRevision] = useState(() => (authStorage.getSupportSession() ? 1 : 0))

  const persistSession = useCallback(async ({ token, user: sessionUser, clearSupportSession = true }: PersistSessionInput) => {
    authStorage.setSession(token, sessionUser)
    if (clearSupportSession) {
      authStorage.clearSupportSession()
    }

    let resolvedUser = sessionUser

    try {
      const { data } = await api.get<AuthUser>('/auth/me')
      resolvedUser = data
    } catch {
      authStorage.setUser(sessionUser)
    }

    setUser(resolvedUser)
    authStorage.setUser(resolvedUser)
    setSessionRevision(current => current + 1)
    return resolvedUser
  }, [])

  const refreshUser = useCallback(async () => {
    const token = authStorage.getToken()
    if (!token) {
      authStorage.clear()
      setUser(null)
      return null
    }

    const { data } = await api.get<AuthUser>('/auth/me')
    setUser(data)
    authStorage.setUser(data)
    return data
  }, [])

  useEffect(() => {
    const token = authStorage.getToken()

    if (!token) {
      setIsReady(true)
      return
    }

    let cancelled = false

    refreshUser()
      .catch(() => {
        authStorage.clear()
        if (!cancelled) setUser(null)
      })
      .finally(() => {
        if (!cancelled) setIsReady(true)
      })

    return () => {
      cancelled = true
    }
  }, [refreshUser])

  const login = useCallback(async (email: string, password: string) => {
    const { data } = await api.post<AuthSessionResponse>('/auth/login', { email, password })
    return persistSession({ token: data.token, user: data.user })
  }, [persistSession])

  const register = useCallback(async (email: string, password: string, clinicName: string) => {
    const { data } = await api.post<AuthSessionResponse>('/auth/register', { email, password, clinicName })
    return persistSession({ token: data.token, user: data.user })
  }, [persistSession])

  const assumeClinic = useCallback(async (targetUserId: number) => {
    const currentToken = authStorage.getToken()
    const currentUser = authStorage.getUser()

    if (!currentToken || !currentUser || !isSupportUser(currentUser)) {
      throw new Error('A sessão de suporte precisa estar ativa para assumir uma clínica.')
    }

    authStorage.setSupportSession({ token: currentToken, user: currentUser })

    const { data } = await api.post<AuthSessionResponse>('/support/assume', { userId: targetUserId })
    authStorage.setSession(data.token, data.user)
    setUser(data.user)
    setSessionRevision(current => current + 1)
    return data.user
  }, [])

  const returnToSupport = useCallback(() => {
    const supportSession = authStorage.getSupportSession()

    if (!supportSession?.token || !supportSession?.user) {
      throw new Error('Não há uma sessão de suporte salva para restaurar.')
    }

    authStorage.setSession(supportSession.token, supportSession.user)
    authStorage.clearSupportSession()
    setUser(supportSession.user)
    setSessionRevision(current => current + 1)
    return supportSession.user
  }, [])

  const logout = useCallback(() => {
    authStorage.clear()
    authStorage.clearSupportSession()
    setUser(null)
    setSessionRevision(current => current + 1)
  }, [])

  const hasSupportSession = Boolean(authStorage.getSupportSession())

  const value = useMemo<AuthContextValue>(() => ({
    user,
    login,
    register,
    logout,
    refreshUser,
    assumeClinic,
    returnToSupport,
    isReady,
    isAuth: Boolean(user),
    isSupport: isSupportUser(user),
    hasSupportSession,
  }), [assumeClinic, hasSupportSession, isReady, login, logout, refreshUser, register, returnToSupport, user])

  return createElement(AuthContext.Provider, { value }, children)
}

export function useAuth(): AuthContextValue {
  const context = useContext(AuthContext)

  if (!context) {
    throw new Error('useAuth precisa ser usado dentro de AuthProvider')
  }

  return context
}
