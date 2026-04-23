import type { Identifier } from './clinicalTypes'
import type { BillingSnapshot } from './types'

export type DocumentCategory = 'LEGAL' | 'SANITARY' | 'CLIENTS' | 'WASTE'
export type DocumentStatus = 'VALID' | 'EXPIRING' | 'EXPIRED' | 'WITHOUT_EXPIRY'

export interface DocumentCategoryOption {
  value: DocumentCategory
  label: string
}

export interface ClinicDocumentSummary {
  id: Identifier
  category: DocumentCategory
  documentType: string
  title: string
  notes?: string | null
  expiresAt?: string | null
  fileName: string
  fileMimeType?: string | null
  createdAt?: string | null
  updatedAt?: string | null
  status: DocumentStatus
  statusLabel: string
  daysUntilExpiry?: number | null
}

export interface ClinicDocumentFileResponse extends ClinicDocumentSummary {
  fileDataUrl: string
}

export interface DocumentCategoryCoverageItem {
  category: DocumentCategory
  categoryLabel: string
  requiredCount: number
  fulfilledCount: number
  total: number
  criticalCount: number
  score: number
  missing: string[]
}

export interface MissingDocumentRequirement {
  id: string
  category: DocumentCategory
  categoryLabel: string
  requirement: string
}

export interface DocumentWindowsSummary {
  next7Days: number
  next15Days: number
  next30Days: number
}

export interface DocumentsSummaryResponse {
  total: number
  valid: number
  expiring: number
  expired: number
  alerts: ClinicDocumentSummary[]
  complianceScore: number
  recommendedRequiredCount: number
  recommendedCoveredCount: number
  missingCount: number
  missingDocuments: MissingDocumentRequirement[]
  categories: DocumentCategoryCoverageItem[]
  windows: DocumentWindowsSummary
  lastUpdatedAt?: string | null
}

export interface DashboardMonthSummary {
  totalClients: number
  totalAppointments: number
  revenue: number
}

export interface DashboardUpcomingAppointment {
  id: Identifier
  status: string
  startAt: string
  client?: {
    name?: string | null
  } | null
  service?: {
    name?: string | null
  } | null
}

export type InventoryEntryMode = 'NEW' | 'EXISTING'
export type InventoryStatus = 'VALID' | 'WARNING' | 'OVERDUE' | 'WITHOUT_DATE'

export interface InventoryAlert {
  id: Identifier
  name: string
  status: InventoryStatus
  statusLabel: string
  assetType: 'PRODUCT' | 'EQUIPMENT'
  entryMode?: InventoryEntryMode
  daysUntilDue?: number | null
  expiresAt?: string | null
  maintenanceDueAt?: string | null
}

export interface ProductItemSummary {
  id: Identifier
  name: string
  category?: string | null
  brand?: string | null
  batch?: string | null
  quantity: number
  unit?: string | null
  entryMode: InventoryEntryMode
  purchasedAt?: string | null
  expiresAt?: string | null
  notes?: string | null
  active?: boolean
  createdAt?: string | null
  updatedAt?: string | null
  status: InventoryStatus
  statusLabel: string
  daysUntilDue?: number | null
}

export interface EquipmentItemSummary {
  id: Identifier
  name: string
  category?: string | null
  brand?: string | null
  model?: string | null
  serialNumber?: string | null
  anvisaRegistration?: string | null
  notificationNumber?: string | null
  processNumber?: string | null
  entryMode: InventoryEntryMode
  acquiredAt?: string | null
  maintenanceDueAt?: string | null
  warrantyUntil?: string | null
  notes?: string | null
  active?: boolean
  createdAt?: string | null
  updatedAt?: string | null
  status: InventoryStatus
  statusLabel: string
  daysUntilDue?: number | null
}

export interface InventoryDashboard {
  totalProducts: number
  totalEquipment: number
  expiringProducts: number
  expiredProducts: number
  dueEquipment: number
  overdueEquipment: number
  alerts: InventoryAlert[]
}

export interface DashboardResponse {
  month: DashboardMonthSummary
  upcoming: DashboardUpcomingAppointment[]
  documents: DocumentsSummaryResponse
  inventory: InventoryDashboard
  billing?: BillingSnapshot | null
}

export type BillingStatusKey = 'TRIAL' | 'ACTIVE' | 'OVERDUE' | 'BLOCKED'
export type ClinicStatusKey = 'ACTIVE' | 'SUSPENDED' | 'ARCHIVED'
export type ClinicBillStatus = 'PENDING' | 'OVERDUE' | 'PAID'

export interface BillingPermissions {
  canManageSubscription: boolean
}

export interface BillingSummaryResponse {
  clinicId: Identifier | null
  clinicName: string
  email: string
  billing: BillingSnapshot
  permissions: BillingPermissions
}

export interface AuditLogItem {
  id: Identifier
  clinicId?: Identifier | null
  actorUserId?: Identifier | null
  actorEmail?: string | null
  actorRole?: string | null
  action: string
  entityType?: string | null
  entityId?: Identifier | null
  metadata?: Record<string, unknown> | null
  createdAt?: string | null
}

export interface AuditLogsResponse {
  logs: AuditLogItem[]
}

export interface ClinicBillItem {
  id: Identifier
  title: string
  category?: string | null
  amount: number
  dueAt?: string | null
  paidAt?: string | null
  notes?: string | null
  active?: boolean
  createdAt?: string | null
  updatedAt?: string | null
  status: ClinicBillStatus
  statusLabel: string
}

export interface ClinicBillsResponse {
  openCount: number
  overdueCount: number
  paidCount: number
  totalOpenAmount: number
  overdueAmount: number
  paidThisMonthAmount: number
  bills: ClinicBillItem[]
}
