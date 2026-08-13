import axios, { AxiosHeaders, type AxiosError, type AxiosInstance, type InternalAxiosRequestConfig } from 'axios'
import type { ApiErrorPayload, AuthUser, SupportSession } from './types'
import toast from 'react-hot-toast'
import { queueOfflineRequest, syncOfflineRequests } from './offlineSync'

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

  const currentHost = window.location.hostname
  if (currentHost === '10.0.2.2') {
    return url
      .replace('://localhost', '://10.0.2.2')
      .replace('://127.0.0.1', '://10.0.2.2')
  }

  if (currentHost === '127.0.0.1') {
    return url.replace('://localhost', '://127.0.0.1')
  }

  if (currentHost === 'localhost') {
    return url.replace('://127.0.0.1', '://localhost')
  }

  return url
}

function inferBaseUrl(): string {
  if (typeof window === 'undefined') {
    return 'http://127.0.0.1:3000'
  }

  const host = window.location.hostname || '127.0.0.1'
  return `${window.location.protocol}//${host}:3000`
}

function getCookie(name: string): string | null {
  if (typeof document === 'undefined') return null
  const value = `; ${document.cookie}`
  const parts = value.split(`; ${name}=`)
  if (parts.length === 2) {
    return parts.pop()?.split(';').shift() || null
  }
  return null
}

let isRefreshing = false
let refreshSubscribers: ((token: string) => void)[] = []

function onRefreshed(token: string) {
  refreshSubscribers.forEach(cb => cb(token))
  refreshSubscribers = []
}

function addRefreshSubscriber(cb: (token: string) => void) {
  refreshSubscribers.push(cb)
}

const api: AxiosInstance = axios.create({
  baseURL: normalizeConfiguredBaseUrl(import.meta.env.VITE_API_URL) || inferBaseUrl(),
  timeout: 15000,
  withCredentials: true,
})

api.interceptors.request.use((config: InternalAxiosRequestConfig) => {
  const token = authStorage.getToken()

  if (token) {
    config.headers = config.headers ?? new AxiosHeaders()
    config.headers.Authorization = `Bearer ${token}`
  }

  const writeMethods = ['post', 'put', 'delete', 'patch']
  if (writeMethods.includes(config.method?.toLowerCase() || '')) {
    const xsrfToken = getCookie('XSRF-TOKEN')
    if (xsrfToken) {
      config.headers = config.headers ?? new AxiosHeaders()
      config.headers['X-XSRF-TOKEN'] = xsrfToken
    }
  }

  return config
})

api.interceptors.response.use(
  response => response,
  error => {
    const originalRequest = error.config

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

      if (!isAuthRoute && originalRequest && !originalRequest._retry) {
        if (isRefreshing) {
          return new Promise(resolve => {
            addRefreshSubscriber((token: string) => {
              originalRequest.headers = originalRequest.headers ?? new AxiosHeaders()
              originalRequest.headers.Authorization = `Bearer ${token}`
              resolve(api(originalRequest))
            })
          })
        }

        originalRequest._retry = true
        isRefreshing = true

        return new Promise((resolve, reject) => {
          api.post('/auth/refresh')
            .then(res => {
              const { token } = res.data
              const user = authStorage.getUser()
              if (token && user) {
                authStorage.setSession(token, user)
                onRefreshed(token)
                originalRequest.headers = originalRequest.headers ?? new AxiosHeaders()
                originalRequest.headers.Authorization = `Bearer ${token}`
                resolve(api(originalRequest))
              } else {
                throw new Error('Falha ao obter novo token')
              }
            })
            .catch(refreshError => {
              authStorage.clear()
              authStorage.clearSupportSession()
              window.location.replace('/login')
              reject(refreshError)
            })
            .finally(() => {
              isRefreshing = false
            })
        })
      }

      if (!isAuthRoute && originalRequest?._retry) {
        authStorage.clear()
        authStorage.clearSupportSession()
        window.location.replace('/login')
      }
    }

    if (typeof window !== 'undefined' && error.response?.status === 402) {
      const isBillingRoute = window.location.pathname === '/assinatura' || window.location.pathname === '/pagamentos'
      if (!isBillingRoute) {
        window.location.replace('/pagamentos')
      }
    }

    const config = error.config
    const isNetworkError = error.message === 'Network Error' || !error.response
    const isOffline = typeof navigator !== 'undefined' && !navigator.onLine

    if (config && (isNetworkError || isOffline)) {
      const isAnamnesisSave = config.method?.toUpperCase() === 'PUT' && /\/api\/v\d+\/medical-records\/by-client\/[^/]+\/anamnesis/.test(config.url || '')
      const isConsentSign = config.method?.toUpperCase() === 'POST' && /\/consent-records\/[^/]+\/sign/.test(config.url || '')
      const isFacialPointsSave = config.method?.toUpperCase() === 'PUT' && /\/api\/v\d+\/clients\/[^/]+\/facial-points/.test(config.url || '')
      const isClientEdit = config.method?.toUpperCase() === 'PATCH' && /\/api\/v\d+\/clients\/[^/]+$/.test(config.url || '')
      const isImageUseConsentGenerate = config.method?.toUpperCase() === 'POST' && /\/clients\/[^/]+\/consent-records\/generate-image-use/.test(config.url || '')

      if (isAnamnesisSave || isConsentSign || isFacialPointsSave || isClientEdit || isImageUseConsentGenerate) {
        let parsedData = null
        try {
          parsedData = typeof config.data === 'string' ? JSON.parse(config.data) : config.data
        } catch {
          parsedData = config.data
        }

        toast.success('Salvo localmente (offline). O prontuário será sincronizado quando a conexão retornar.', {
          duration: 5000,
          id: 'offline-toast'
        })

        void queueOfflineRequest({
          url: config.url || '',
          method: (config.method?.toUpperCase() as any) || 'PUT',
          data: parsedData,
          headers: config.headers ? { ...config.headers } : {}
        })

        let mockResponseData: any = {
          ok: true,
          message: 'Salvo localmente (offline)',
          accessState: { readOnly: false, allowedActions: {} },
          security: { auditTrail: {}, photoConsent: {} },
          client: {}
        }

        if (isFacialPointsSave) {
          mockResponseData = parsedData || []
        } else if (isClientEdit) {
          mockResponseData = {
            id: Number(config.url?.split('/').pop()) || 0,
            ...parsedData
          }
        }

        return Promise.resolve({
          status: 200,
          data: mockResponseData,
          headers: {},
          config,
        })
      }
    }

    return Promise.reject(error)
  }
)

if (typeof window !== 'undefined') {
  window.addEventListener('online', () => {
    void syncOfflineRequests(api)
  })

  if (navigator.onLine) {
    setTimeout(() => {
      void syncOfflineRequests(api)
    }, 1000)
  }
}

export default api
