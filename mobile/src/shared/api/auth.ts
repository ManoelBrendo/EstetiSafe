import { requestApi, setMobileAuthToken } from './client'
import type { AuthSessionResponse } from '../types/auth'

export const authApi = {
  async login(email: string, password: string) {
    const session = await requestApi<AuthSessionResponse>('/auth/login', {
      method: 'POST',
      body: { email, password },
      skipAuth: true,
    })

    setMobileAuthToken(session.token)
    return session
  },
  logout() {
    setMobileAuthToken(null)
  },
}
