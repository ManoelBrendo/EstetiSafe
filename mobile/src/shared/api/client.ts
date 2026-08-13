import { mobileEnv } from '../env'

type RequestOptions = {
  method?: 'GET' | 'POST' | 'PUT' | 'DELETE'
  body?: unknown
  token?: string | null
  skipAuth?: boolean
}

let runtimeToken: string | null = null

export function setMobileAuthToken(token: string | null) {
  runtimeToken = token
}

export function getMobileAuthToken() {
  return runtimeToken || mobileEnv.token || null
}

export class ApiError extends Error {
  status: number

  constructor(message: string, status: number) {
    super(message)
    this.name = 'ApiError'
    this.status = status
  }
}

function buildUrl(path: string) {
  const baseUrl = mobileEnv.apiUrl.replace(/\/$/, '')
  const cleanPath = path.startsWith('/') ? path : `/${path}`
  return `${baseUrl}${cleanPath}`
}

export async function requestApi<T>(path: string, options: RequestOptions = {}): Promise<T> {
  const token = options.skipAuth ? null : options.token ?? getMobileAuthToken()
  const headers: Record<string, string> = {
    Accept: 'application/json',
  }

  if (options.body !== undefined) {
    headers['Content-Type'] = 'application/json'
  }

  if (token) {
    headers.Authorization = `Bearer ${token}`
  }

  const response = await fetch(buildUrl(path), {
    method: options.method || 'GET',
    headers,
    body: options.body === undefined ? undefined : JSON.stringify(options.body),
  })

  const isJson = response.headers.get('content-type')?.includes('application/json')
  const payload = isJson ? await response.json() : null

  if (!response.ok) {
    const message = payload?.error || payload?.issues?.[0]?.message || 'Nao foi possivel concluir a acao.'
    throw new ApiError(message, response.status)
  }

  return payload as T
}
