export interface AuthUser {
  id: number
  email: string
  clinicName: string
  clinicLogoDataUrl?: string | null
  role?: string | null
}

export interface AuthSessionResponse {
  token: string
  user: AuthUser
}
