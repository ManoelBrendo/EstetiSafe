import axios, { AxiosHeaders, type AxiosError, type AxiosInstance, type InternalAxiosRequestConfig } from 'axios'
import type { ApiErrorPayload, AuthUser, SupportSession } from './types'

const TOKEN_KEY = 'lappui_token'
const USER_KEY = 'lappui_user'
const LEGACY_TOKEN_KEY = 'estetisafe_token'
const LEGACY_USER_KEY = 'estetisafe_user'
const SUPPORT_SESSION_KEY = 'lappui_support_session'

function getStorage(): Storage | null {
  if (typeof window === 'undefined') {
    return null
  }

  return window.localStorage
}

function readJsonStorage<T>(key: string): T | null {
  const storage = getStorage()
  const raw = storage?.getItem(key)
  if (!raw) return null

  try {
    return JSON.parse(raw) as T
  } catch {
    return null
  }
}

export const authStorage = {
  getToken(): string | null {
    const storage = getStorage()
    return storage?.getItem(TOKEN_KEY) || storage?.getItem(LEGACY_TOKEN_KEY) || null
  },
  getUser(): AuthUser | null {
    return readJsonStorage<AuthUser>(USER_KEY) || readJsonStorage<AuthUser>(LEGACY_USER_KEY)
  },
  setSession(token: string, user: AuthUser): void {
    const storage = getStorage()
    if (!storage) return

    storage.setItem(TOKEN_KEY, token)
    storage.setItem(USER_KEY, JSON.stringify(user))
    storage.removeItem(LEGACY_TOKEN_KEY)
    storage.removeItem(LEGACY_USER_KEY)
  },
  setUser(user: AuthUser): void {
    const storage = getStorage()
    if (!storage) return

    storage.setItem(USER_KEY, JSON.stringify(user))
    storage.removeItem(LEGACY_USER_KEY)
  },
  getSupportSession(): SupportSession | null {
    return readJsonStorage<SupportSession>(SUPPORT_SESSION_KEY)
  },
  setSupportSession(session: SupportSession): void {
    const storage = getStorage()
    if (!storage) return

    storage.setItem(SUPPORT_SESSION_KEY, JSON.stringify(session))
  },
  clearSupportSession(): void {
    const storage = getStorage()
    storage?.removeItem(SUPPORT_SESSION_KEY)
  },
  clear(): void {
    const storage = getStorage()
    if (!storage) return

    storage.removeItem(TOKEN_KEY)
    storage.removeItem(USER_KEY)
    storage.removeItem(LEGACY_TOKEN_KEY)
    storage.removeItem(LEGACY_USER_KEY)
  },
}

export function getApiErrorMessage(error: unknown, fallback = 'Não foi possível concluir a ação'): string {
  const axiosError = error as AxiosError<ApiErrorPayload>

  return (
    axiosError?.response?.data?.error ||
    axiosError?.response?.data?.issues?.[0]?.message ||
    (error instanceof Error ? error.message : fallback)
  )
}

function getDownloadFilename(disposition?: string | null): string | null {
  if (!disposition) return null

  const utf8Match = disposition.match(/filename\*=UTF-8''([^;]+)/i)
  if (utf8Match) {
    try {
      return decodeURIComponent(utf8Match[1])
    } catch {
      return utf8Match[1]
    }
  }

  const fallbackMatch = disposition.match(/filename="?([^";]+)"?/i)
  return fallbackMatch ? fallbackMatch[1] : null
}

export async function downloadApiFile(path: string, fallbackFilename = 'arquivo.pdf'): Promise<void> {
  const response = await api.get(path, { responseType: 'blob' })
  const contentType = response.headers?.['content-type'] || 'application/octet-stream'
  const blob = response.data instanceof Blob ? response.data : new Blob([response.data], { type: contentType })
  const href = URL.createObjectURL(blob)
  const link = document.createElement('a')

  link.href = href
  link.download = getDownloadFilename(response.headers?.['content-disposition']) || fallbackFilename
  document.body.appendChild(link)
  link.click()
  link.remove()
  URL.revokeObjectURL(href)
}

function normalizeConfiguredBaseUrl(url?: string): string {
  if (!url) return ''
  if (typeof window === 'undefined') return url

  if (window.location.hostname === '10.0.2.2') {
    return url
      .replace('://localhost', '://10.0.2.2')
      .replace('://127.0.0.1', '://10.0.2.2')
  }

  return url
}

function inferBaseUrl(): string {
  if (typeof window === 'undefined') {
    return 'http://localhost:3000'
  }

  const host = window.location.hostname === '127.0.0.1'
    ? 'localhost'
    : window.location.hostname || 'localhost'

  return `${window.location.protocol}//${host}:3000`
}

const api: AxiosInstance = axios.create({
  baseURL: normalizeConfiguredBaseUrl(import.meta.env.VITE_API_URL) || inferBaseUrl(),
  timeout: 15000,
})

api.interceptors.request.use((config: InternalAxiosRequestConfig) => {
  const token = authStorage.getToken()

  if (token) {
    config.headers = config.headers ?? new AxiosHeaders()
    config.headers.Authorization = `Bearer ${token}`
  }

  return config
})

api.interceptors.response.use(
  response => response,
  error => {
    if (typeof window !== 'undefined' && error.response?.status === 401) {
      const supportSession = authStorage.getSupportSession()
      const isAuthRoute = window.location.pathname === '/login' || window.location.pathname === '/register'

      if (supportSession?.token && supportSession?.user) {
        authStorage.setSession(supportSession.token, supportSession.user)
        authStorage.clearSupportSession()

        if (window.location.pathname !== '/suporte') {
          window.location.replace('/suporte')
        }

        return Promise.reject(error)
      }

      authStorage.clear()
      authStorage.clearSupportSession()

      if (!isAuthRoute) {
        window.location.replace('/login')
      }
    }

    if (typeof window !== 'undefined' && error.response?.status === 402) {
      const isBillingRoute = window.location.pathname === '/assinatura' || window.location.pathname === '/pagamentos'
      if (!isBillingRoute) {
        window.location.replace('/assinatura')
      }
    }

    return Promise.reject(error)
  }
)

export default api
