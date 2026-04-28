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

export type BillingGatewayIntentStatus = 'PENDING' | 'PAID' | 'FAILED' | 'CANCELLED' | 'EXPIRED'

export interface BillingGatewayIntent {
  id?: Identifier
  provider?: string | null
  reference?: string | null
  clinicId?: Identifier | null
  amount?: number | null
  currency?: string | null
  status?: BillingGatewayIntentStatus | string | null
  paymentMethod?: PaymentMethod | string | null
  dueAt?: string | null
  expiresAt?: string | null
  checkoutUrl?: string | null
  pixCopyPaste?: string | null
  message?: string | null
  createdAt?: string | null
  paidAt?: string | null
  providerPaymentId?: string | null
  eventCount?: number
}

export interface BillingGatewayStatusResponse {
  provider: string
  mode: string
  persistence?: string | null
  configured: boolean
  webhookConfigured: boolean
  latestIntent?: BillingGatewayIntent | null
  message?: string | null
}

export interface BillingGatewayIntentResponse {
  intent: BillingGatewayIntent
  billing: BillingSnapshot
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

export type AppointmentStatus = 'SCHEDULED' | 'CONFIRMED' | 'IN_PROGRESS' | 'COMPLETED' | 'CANCELLED' | 'NO_SHOW'
export type PaymentMethod = 'PIX' | 'CASH' | 'CREDIT_CARD' | 'DEBIT_CARD' | 'BANK_TRANSFER'
export type PaymentStatus = 'PENDING' | 'PAID' | 'FAILED' | 'REFUNDED' | 'CANCELLED'

export interface AppointmentClientOption {
  id: Identifier
  name: string
  phone?: string | null
}

export interface AppointmentServiceOption {
  id: Identifier
  name: string
  duration?: number | null
  price?: number | null
}

export interface AppointmentProfessionalOption {
  id: Identifier
  name: string
}

export interface AppointmentPaymentRecord {
  id?: Identifier
  amount?: number | null
  method?: PaymentMethod | string | null
  status?: PaymentStatus | string | null
  paidAt?: string | null
}

export interface AppointmentRecord {
  id: Identifier
  clientId: Identifier
  serviceId: Identifier
  professionalId: Identifier
  startAt: string
  endAt: string
  notes?: string | null
  price: number
  status: AppointmentStatus | string
  client?: AppointmentClientOption | null
  service?: AppointmentServiceOption | null
  professional?: AppointmentProfessionalOption | null
  payment?: AppointmentPaymentRecord | null
  createdAt?: string | null
  updatedAt?: string | null
}

export type WeekdayValue =
  | 'MONDAY'
  | 'TUESDAY'
  | 'WEDNESDAY'
  | 'THURSDAY'
  | 'FRIDAY'
  | 'SATURDAY'
  | 'SUNDAY'

export type ProfessionalContractType = 'CLT' | 'PJ' | 'AUTONOMA' | 'COMISSIONADA' | 'PARCERIA'
export type ProfessionalPaymentModel = 'FIXED' | 'COMMISSION' | 'HYBRID' | 'DAILY'

export interface ProfessionalAvailabilitySlot {
  day: WeekdayValue
  label?: string
  enabled: boolean
  start: string
  end: string
}

export interface ProfessionalSummary {
  id: Identifier
  name: string
  specialty: string
  phone?: string | null
  notes?: string | null
  photoDataUrl?: string | null
  availability: ProfessionalAvailabilitySlot[]
  availabilitySummary?: string | null
  contractType?: ProfessionalContractType | string | null
  contractTypeLabel?: string | null
  paymentModel?: ProfessionalPaymentModel | string | null
  paymentModelLabel?: string | null
  salaryAmount?: number | null
  commissionRate?: number | null
  paymentDay?: number | null
  payrollNotes?: string | null
  compensationSummary?: string | null
  active?: boolean
  createdAt?: string | null
  updatedAt?: string | null
}

export interface ProfessionalMetrics {
  totalAppointments: number
  completedAppointments: number
  upcomingAppointments: number
}

export interface ProfessionalPayrollMetrics {
  paidRevenue?: number | null
  commissionAmount?: number | null
  projectedPayout?: number | null
  paidAppointments?: number
  workedDays?: number
  lastPaidAt?: string | null
  periodStart?: string | null
  periodEnd?: string | null
}

export interface ProfessionalRecentAppointment {
  id: Identifier
  startAt: string
  endAt?: string | null
  status: AppointmentStatus | string
  notes?: string | null
  price?: number | null
  client?: AppointmentClientOption | null
  service?: AppointmentServiceOption | null
  payment?: AppointmentPaymentRecord | null
}

export interface ProfessionalDetail extends ProfessionalSummary {
  metrics?: ProfessionalMetrics | null
  payroll?: ProfessionalPayrollMetrics | null
  appointments?: ProfessionalRecentAppointment[]
}

export interface ServicePopSummary {
  id: Identifier
  title: string
  updatedAt?: string | null
  downloadName?: string | null
  content?: string
  service?: {
    id: Identifier
    name: string
    duration?: number | null
  } | null
}

export interface ServiceRecord {
  id: Identifier
  name: string
  description?: string | null
  duration: number
  price: number
  active?: boolean
  createdAt?: string | null
  updatedAt?: string | null
  servicePop?: ServicePopSummary | null
}

export interface SupportClinicRecord {
  id: number
  email: string
  clinicName: string
  clinicLogoDataUrl?: string | null
  role?: string | null
  createdAt?: string | null
  clinicId?: number | string | null
  clinicStatus?: ClinicStatusKey | string | null
  billing?: BillingSnapshot | null
}

export interface SupportClinicsResponse {
  totalClinics: number
  blockedCount: number
  overdueCount: number
  clinics: SupportClinicRecord[]
}
