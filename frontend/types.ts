export interface BillingSnapshot {
  status?: string | null
  effectiveStatus?: string | null
  blocked?: boolean
  amount?: number | null
  reference?: string | null
  notes?: string | null
  graceEndsAt?: string | null
  lastPaidAt?: string | null
  nextDueAt?: string | null
  blockAt?: string | null
  daysRemaining?: number | null
  message?: string | null
}

export interface SupportContext {
  active?: boolean
  supportUserId?: number | null
  supportEmail?: string | null
  assumedAt?: string | null
}

export interface AuthUser {
  id: number
  email: string
  clinicName: string
  clinicLogoDataUrl?: string | null
  clinicId?: number | string | null
  clinicStatus?: string | null
  role?: string | null
  createdAt?: string | Date | null
  billing?: BillingSnapshot | null
  supportContext?: SupportContext | null
  [key: string]: unknown
}

export interface SupportContact {
  name: string
  email: string
  phone: string
}

export interface SupportSession {
  token: string
  user: AuthUser
}

export interface AuthSessionResponse {
  token: string
  user: AuthUser
}

export interface ApiValidationIssue {
  message?: string
}

export interface ApiErrorPayload {
  error?: string
  issues?: ApiValidationIssue[]
}
