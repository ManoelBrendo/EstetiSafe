export type Identifier = number | string

export type DocumentCategory = 'LEGAL' | 'SANITARY' | 'CLIENTS' | 'WASTE'
export type DocumentStatus = 'VALID' | 'EXPIRING' | 'EXPIRED' | 'WITHOUT_EXPIRY'

export interface ClinicDocumentSummary {
  id: Identifier
  title: string
  category: DocumentCategory
  categoryLabel?: string | null
  documentType?: string | null
  status: DocumentStatus
  statusLabel?: string | null
  expiresAt?: string | null
  updatedAt?: string | null
  fileName?: string | null
  notes?: string | null
}

export interface DocumentsSummaryResponse {
  total: number
  valid: number
  expiring: number
  expired: number
  missingCount?: number
  complianceScore?: number
  lastUpdatedAt?: string | null
}

export interface AuditLogItem {
  id: Identifier
  action: string
  category?: string | null
  severity?: 'LOW' | 'MEDIUM' | 'HIGH'
  entityType?: string | null
  entityId?: Identifier | null
  description?: string | null
  createdAt?: string | null
  metadata?: Record<string, unknown> | null
}

export interface AuditLogsResponse {
  logs: AuditLogItem[]
  summary?: {
    total: number
    highRiskCount: number
  }
}

export type WeekdayValue = 'MONDAY' | 'TUESDAY' | 'WEDNESDAY' | 'THURSDAY' | 'FRIDAY' | 'SATURDAY' | 'SUNDAY'

export interface ProfessionalAvailabilitySlot {
  day: WeekdayValue
  label?: string
  enabled?: boolean
  start?: string | null
  end?: string | null
}

export interface ProfessionalSummary {
  id: Identifier
  name: string
  specialty: string
  phone?: string | null
  notes?: string | null
  active?: boolean
  availability?: ProfessionalAvailabilitySlot[]
  availabilitySummary?: string | null
  compensationSummary?: string | null
  payroll?: {
    completedAppointments?: number
    grossRevenue?: number
    estimatedPayout?: number
  } | null
}
