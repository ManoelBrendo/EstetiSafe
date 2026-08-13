import type { Identifier } from './clinicalTypes'
import type { BillingSnapshot } from './types'

export type DocumentCategory = 'LEGAL' | 'SANITARY' | 'CLIENTS' | 'WASTE'
export type DocumentStatus = 'VALID' | 'EXPIRING' | 'EXPIRED' | 'WITHOUT_EXPIRY'
export type ClinicOperationalScope = 'FACIAL' | 'INJECTABLES' | 'LASER' | 'BODY' | 'ADVANCED'

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
  sourceScopes?: string[]
  sourceScopeLabels?: string[]
}

export interface DocumentWindowsSummary {
  next7Days: number
  next15Days: number
  next30Days: number
}

export interface DocumentsProfileSummary {
  scopes: string[]
  scopeLabels: string[]
  selectedCount: number
  requiredBaseCount: number
  specializedRequirementCount: number
  availableScopes?: Array<{
    value: string
    label: string
  }>
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
  profile?: DocumentsProfileSummary
  lastUpdatedAt?: string | null
}

export type ProfessionalDocumentCategory = 'CONTRACT' | 'CERTIFICATION' | 'COUNCIL' | 'TRAINING' | 'PERMISSION'
export type ProfessionalDocumentRequirementStatus = DocumentStatus | 'MISSING'

export interface ProfessionalDocumentSummary {
  id: Identifier
  professionalId: Identifier
  professionalName?: string | null
  professionalSpecialty?: string | null
  category: ProfessionalDocumentCategory | string
  categoryLabel: string
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

export interface ProfessionalDocumentFileResponse extends ProfessionalDocumentSummary {
  fileDataUrl: string
}

export interface ProfessionalDocumentRequirement {
  id: string
  professionalId: Identifier
  professionalName: string
  professionalSpecialty?: string | null
  category: ProfessionalDocumentCategory | string
  categoryLabel: string
  requirement: string
  status?: ProfessionalDocumentRequirementStatus
  statusLabel?: string
  matchedDocumentId?: Identifier | null
  matchedTitle?: string | null
  daysUntilExpiry?: number | null
}

export interface ProfessionalDocumentCoverage {
  professionalId: Identifier
  professionalName: string
  professionalSpecialty?: string | null
  requiredCount: number
  coveredCount: number
  missingCount: number
  expiringCount: number
  expiredCount: number
  criticalCount: number
  score: number
  missingRequirements: ProfessionalDocumentRequirement[]
  documents?: ProfessionalDocumentSummary[]
}

export interface ProfessionalDocumentRequirementCatalogItem {
  category: ProfessionalDocumentCategory | string
  categoryLabel: string
  requirement: string
}

export interface ProfessionalDocumentsDashboard {
  activeProfessionals: number
  totalDocuments: number
  requiredCount: number
  coveredCount: number
  missingCount: number
  expiring: number
  expired: number
  complianceScore: number
  alerts: ProfessionalDocumentSummary[]
  missingRequirements: ProfessionalDocumentRequirement[]
  byProfessional: ProfessionalDocumentCoverage[]
  requirementCatalog?: ProfessionalDocumentRequirementCatalogItem[]
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

export type ClinicalInsightPriority = 'INFO' | 'WARNING' | 'CRITICAL'

export interface ClinicalInsightItem {
  id: string
  source: string
  kind: string
  priority: ClinicalInsightPriority | string
  title: string
  description: string
  evidence: string[]
  actionLabel: string
  metadata?: Record<string, unknown>
}

export interface ClinicalAiReadiness {
  mode: string
  provider: string
  externalAiEnabled: boolean
  ready: boolean
  missing: string[]
  safeguards: string[]
  message: string
}

export interface ClinicalInsightsSummary {
  mode: string
  externalAiEnabled: boolean
  readiness: ClinicalAiReadiness
  generatedAt: string
  total: number
  countsByPriority: Record<ClinicalInsightPriority, number>
  insights: ClinicalInsightItem[]
  message: string
}

export interface DashboardResponse {
  month: DashboardMonthSummary
  upcoming: DashboardUpcomingAppointment[]
  documents: DocumentsSummaryResponse
  inventory: InventoryDashboard
  clinicalInsights?: ClinicalInsightsSummary | null
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

export interface BillingGatewayAutomationConfig {
  enabled: boolean
  method: PaymentMethod | string
  lookAheadDays: number
  intervalMinutes: number
  message?: string | null
}

export interface BillingGatewayReadiness {
  status: 'READY' | 'PARTIAL' | 'SIMULATION' | string
  provider: string
  mode: string
  persistence: string
  configured: boolean
  readyForLiveProvider: boolean
  webhookConfigured: boolean
  automaticBillingEnabled: boolean
  supportedMethods: Array<PaymentMethod | string>
  missing: string[]
  message: string
}

export interface BillingGatewayStatusResponse {
  provider: string
  mode: string
  persistence?: string | null
  configured: boolean
  webhookConfigured: boolean
  readiness?: BillingGatewayReadiness | null
  supportedMethods?: Array<PaymentMethod | string>
  automation?: BillingGatewayAutomationConfig | null
  latestIntent?: BillingGatewayIntent | null
  message?: string | null
}

export interface BillingGatewayIntentResponse {
  intent: BillingGatewayIntent
  billing: BillingSnapshot
}

export type AuditSeverity = 'LOW' | 'MEDIUM' | 'HIGH'

export interface AuditSummaryAction {
  action: string
  label: string
  category: string
  severity: AuditSeverity
  count: number
}

export interface AuditSummaryCategory {
  category: string
  count: number
}

export interface AuditLogSummary {
  total: number
  highRiskCount: number
  byAction: AuditSummaryAction[]
  byCategory: AuditSummaryCategory[]
}

export interface AuditLogItem {
  id: Identifier
  clinicId?: Identifier | null
  actorUserId?: Identifier | null
  actorEmail?: string | null
  actorRole?: string | null
  action: string
  actionLabel?: string | null
  category?: string | null
  severity?: AuditSeverity | null
  description?: string | null
  entityType?: string | null
  entityId?: Identifier | null
  metadata?: Record<string, unknown> | null
  createdAt?: string | null
}

export interface AuditLogsResponse {
  items?: AuditLogItem[]
  logs: AuditLogItem[]
  total?: number
  page?: number
  pageSize?: number
  totalPages?: number
  summary?: AuditLogSummary
  filters?: Record<string, string | null>
}

export type AuditCorrectiveActionStatus = 'OPEN' | 'IN_PROGRESS' | 'DONE' | 'DISMISSED'

export interface AuditCorrectiveActionAttachment {
  id: Identifier
  actionId: Identifier
  fileName: string
  fileMimeType?: string | null
  notes?: string | null
  createdAt?: string | null
}

export interface AuditCorrectiveActionAttachmentFileResponse extends AuditCorrectiveActionAttachment {
  fileDataUrl: string
}

export interface AuditCorrectiveAction {
  id: Identifier
  taskKey: string
  domainId: string
  domainTitle: string
  title: string
  owner: string
  dueLabel?: string | null
  dueAt?: string | null
  evidence?: string | null
  actionUrl?: string | null
  riskLevel: 'CRITICAL' | 'WARNING' | 'OK' | string
  status: AuditCorrectiveActionStatus
  completedAt?: string | null
  dismissedAt?: string | null
  createdAt?: string | null
  updatedAt?: string | null
  attachments?: AuditCorrectiveActionAttachment[]
}

export interface AuditCorrectiveActionsResponse {
  total: number
  items: AuditCorrectiveAction[]
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
  payrollBonusAmount?: number | null
  payrollDiscountAmount?: number | null
  paymentDay?: number | null
  payrollNotes?: string | null
  compensationSummary?: string | null
  documentCoverage?: ProfessionalDocumentCoverage | null
  payroll?: ProfessionalPayrollMetrics | null
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
  fixedAmount?: number | null
  bonusAmount?: number | null
  discountAmount?: number | null
  grossPayout?: number | null
  projectedPayout?: number | null
  completedAppointments?: number
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
  documents?: ProfessionalDocumentSummary[]
  documentsDashboard?: ProfessionalDocumentsDashboard | null
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

export interface IntercurrenceLinkedClient {
  id: Identifier
  name: string
  phone?: string | null
}

export interface IntercurrenceLinkedService {
  id: Identifier
  name: string
}

export interface IntercurrenceLinkedProfessional {
  id: Identifier
  name: string
  specialty?: string | null
}

export interface ClinicalIntercurrenceEditEntry {
  id: Identifier
  editedByUserId?: Identifier | null
  editedByEmail?: string | null
  editReason?: string | null
  changes?: Record<string, { from?: unknown; to?: unknown }> | null
  createdAt?: string | null
}

export interface ClinicalIntercurrenceRecord {
  id: Identifier
  clientId: Identifier
  serviceId?: Identifier | null
  professionalId?: Identifier | null
  procedureName: string
  occurredAt: string
  description: string
  conduct: string
  notes?: string | null
  professionalName: string
  createdByUserId?: Identifier | null
  createdByEmail?: string | null
  createdAt?: string | null
  updatedAt?: string | null
  client?: IntercurrenceLinkedClient | null
  service?: IntercurrenceLinkedService | null
  professional?: IntercurrenceLinkedProfessional | null
  editsCount?: number
  edits?: ClinicalIntercurrenceEditEntry[]
}

export interface ClinicalIntercurrencesResponse {
  items: ClinicalIntercurrenceRecord[]
  total: number
}

export interface ClinicalIntercurrencePayload {
  clientId: Identifier
  serviceId?: Identifier | null
  procedureName: string
  occurredDate: string
  occurredTime: string
  description: string
  conduct: string
  notes?: string
  professionalId?: Identifier | null
  professionalName?: string
}

export interface ClinicalIntercurrenceUpdatePayload extends Partial<ClinicalIntercurrencePayload> {
  editReason: string
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

