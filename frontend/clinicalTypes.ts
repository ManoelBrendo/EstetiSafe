export type Identifier = string | number

export interface SelectOption {
  value: string
  label: string
}

export interface FieldDefinition {
  key: string
  label: string
}

export interface ClientSeed {
  id?: Identifier
  name?: string
  fullName?: string
  phone?: string
  email?: string
  birthDate?: string
  cpf?: string
  sex?: string
  maritalStatus?: string
  profession?: string
  addressFull?: string
  notes?: string
  [key: string]: unknown
}

export interface AestheticConditionMeta {
  type: string
  label: string
  classificationLabel: string
  classificationOptions: string[]
}

export interface AestheticCondition {
  type: string
  label: string
  present: boolean
  classification: string
  notes: string
}

export interface AestheticHistoryEntry {
  id: string
  procedureName: string
  procedureDate: string
  notes: string
  intercurrences: string
}

export interface TreatmentService {
  id: string
  name: string
  sessions: number
  description: string
  adverseEffects: string
}

export interface PhotoRecordEntry {
  id: string
  caption: string
  dataUrl: string
  fileName?: string
}

export interface IdentificationSection {
  fullName: string
  cpf: string
  birthDate: string
  age: string
  sex: string
  maritalStatus: string
  profession: string
  phone: string
  email: string
  addressFull: string
}

export interface ChiefComplaintSection {
  desiredProcedure: string
  currentDiscomfort: string
  complaintDuration: string
  previousTreatment: string
}

export interface PreExistingConditionsSection {
  hypertension: boolean
  diabetes: boolean
  heartDisease: boolean
  autoimmuneDisease: boolean
  hormonalIssues: boolean
  kidneyIssues: boolean
  liverIssues: boolean
  otherConditions: string
}

export interface SurgeriesSection {
  hadSurgeries: boolean
  surgeryDetails: string
  approximateDate: string
  hadComplications: boolean
}

export interface MedicationsSection {
  continuousMedication: boolean
  medicationDetails: string
  anticoagulants: boolean
  corticosteroids: boolean
  recentAntibiotics: boolean
}

export interface AllergiesSection {
  hasAllergies: boolean
  medicationAllergy: boolean
  cosmeticsAllergy: boolean
  anestheticsAllergy: boolean
  notes: string
}

export interface DermatologicalHistorySection {
  activeAcne: boolean
  rosacea: boolean
  melasma: boolean
  skinSensitivity: boolean
  keloidTendency: boolean
}

export interface HealthHistorySection {
  preExistingConditions: PreExistingConditionsSection
  surgeries: SurgeriesSection
  medications: MedicationsSection
  allergies: AllergiesSection
  dermatologicalHistory: DermatologicalHistorySection
  aestheticHistory: AestheticHistoryEntry[]
}

export interface LifestyleSection {
  smoking: boolean
  alcoholConsumption: boolean
  alcoholFrequency: string
  dailyWaterIntake: string
  diet: string
  physicalActivity: boolean
  workoutsPerWeek: string
  sleepQuality: string
}

export interface ObservedConditionsSection {
  wrinkles: boolean
  sagging: boolean
  spots: boolean
  scars: boolean
  localizedFat: boolean
  cellulite: boolean
  stretchMarks: boolean
}

export interface AestheticEvaluationSection {
  skinType: string
  fitzpatrick: string
  conditions: AestheticCondition[]
  observedConditions: ObservedConditionsSection
}

export interface ContraindicationsSection {
  pregnancy: boolean
  lactation: boolean
  activeInfections: boolean
  recentIsotretinoin: boolean
  activeDermatologicalDiseases: boolean
  metallicImplants: boolean
  additionalNotes: string
}

export interface ExpectationsSection {
  treatmentExpectations: string
  expectedResultTimeline: string
  awareOfLimitations: boolean
}

export interface PhotoRecordSection {
  photos: PhotoRecordEntry[]
  imageUseAuthorized: boolean
  clinicalUseAuthorized: boolean
  marketingUseAuthorized: boolean
  consentVersion: string
  consentAcceptedAt: string | null
}

export interface TreatmentPlanSection {
  recommendedProcedure: string
  sessionCount: number | string | null
  sessionInterval: string
  productsUsed: string
  equipmentsUsed: string
  services: TreatmentService[]
}

export interface ScienceTermSection {
  informedHistoryAccurately: boolean
  awareOfRisks: boolean
  receivedPreAndPostGuidance: boolean
}

export interface SignaturesSection {
  patientSignatureDataUrl: string
  professionalSignatureDataUrl: string
  professionalId: Identifier | null
  professionalName: string
  signedAt: string
}

export interface AnamnesisForm {
  identification: IdentificationSection
  chiefComplaint: ChiefComplaintSection
  healthHistory: HealthHistorySection
  lifestyle: LifestyleSection
  aestheticEvaluation: AestheticEvaluationSection
  contraindications: ContraindicationsSection
  expectations: ExpectationsSection
  treatmentObjective: string
  photoRecord: PhotoRecordSection
  treatmentPlan: TreatmentPlanSection
  scienceTerm: ScienceTermSection
  signatures: SignaturesSection
}

export interface AnamnesisRecordVersion extends AnamnesisForm {
  id?: Identifier
  filledAt?: string | null
  updatedAt?: string | null
}

export interface AnamnesisRecordInput {
  id?: Identifier
  filledAt?: string | null
  updatedAt?: string | null
  answers?: Record<string, unknown> | null
  [key: string]: unknown
}

export interface AllowedActions {
  view: boolean
  downloadPdf: boolean
  editAnamnesis: boolean
  editProtocols: boolean
  editEvaluations: boolean
  editRecommendations: boolean
}

export interface AccessState {
  isPaid: boolean
  isLocked: boolean
  lockedAt: string | null
  lockMessage: string | null
  readOnly: boolean
  allowedActions: AllowedActions
}

export interface ClientUpsertPayload {
  fullName: string
  phone: string
  email: string
  birthDate: string
  cpf: string
  sex: string
  maritalStatus: string
  profession: string
  addressFull: string
  notes: string
}

export interface ServiceReference {
  id?: Identifier
  name?: string
  duration?: number | null
  description?: string | null
  [key: string]: unknown
}

export interface ProfessionalReference {
  id?: Identifier
  name?: string
  [key: string]: unknown
}

export interface TimelineItem {
  type?: string
  entityId?: Identifier
  occurredAt?: string | null
  status?: string | null
  label?: string
  [key: string]: unknown
}

export interface AppointmentSummary {
  id?: Identifier
  startAt?: string | null
  status?: string | null
  price?: number | null
  service?: ServiceReference | null
  professional?: ProfessionalReference | null
  [key: string]: unknown
}

export interface ConsentRecordSummary {
  id?: Identifier
  title?: string | null
  versionLabel?: string | null
  status?: string | null
  createdAt?: string | null
  signedAt?: string | null
  professionalName?: string | null
  [key: string]: unknown
}

export interface PaymentItem {
  id?: Identifier
  amount: number
  method?: string | null
  status?: string | null
  paidAt?: string | null
  appointment: AppointmentSummary | null
  [key: string]: unknown
}

export interface ClientRecord {
  id: Identifier
  fullName: string
  name: string
  phone?: string
  email?: string
  birthDate?: string
  cpf?: string
  sex?: string
  maritalStatus?: string
  profession?: string
  addressFull?: string
  notes?: string
  createdAt?: string | null
  latestAnamnesis: AnamnesisRecordVersion | null
  latestConsentRecord: ConsentRecordSummary | null
  latestAppointment: AppointmentSummary | null
  appointments: AppointmentSummary[]
  consentRecords: ConsentRecordSummary[]
  anamneses: AnamnesisRecordVersion[]
  payments: PaymentItem[]
  isPaid: boolean
  isLocked: boolean
  lockedAt: string | null
  lockMessage: string | null
  readOnly: boolean
  allowedActions: AllowedActions
  prontuarioStatus: AccessState
  [key: string]: unknown
}

export interface MedicalRecordBundle {
  client: ClientRecord
  accessState: AccessState
  latestAnamnesis: AnamnesisRecordVersion | null
  anamnesisHistory: AnamnesisRecordVersion[]
  appointments: AppointmentSummary[]
  payments: PaymentItem[]
  consentRecords: ConsentRecordSummary[]
  timeline: TimelineItem[]
  pdf: {
    available: boolean
    legacyPath: string | null
  }
  [key: string]: unknown
}

export interface ProtocolService {
  id?: Identifier
  name?: string
  customServiceName?: string
  sessions: number
  sortOrder: number
  description?: string
  adverseEffects?: string
  linkedService: ServiceReference | null
  [key: string]: unknown
}

export interface ProtocolEntry {
  id?: Identifier
  protocolName?: string
  recommendedProcedure?: string
  status?: string
  treatmentObjective?: string
  sessionCount: number | ''
  sessionInterval?: string
  productsUsed?: string
  equipmentsUsed?: string
  recommendations?: string
  guidelines?: string
  notes?: string
  services: ProtocolService[]
  [key: string]: unknown
}

export interface ProtocolsBundle {
  current: ProtocolEntry | null
  history: ProtocolEntry[]
  accessState: AccessState
  availableActions: {
    view: boolean
    edit: boolean
    downloadPdf: boolean
  }
  [key: string]: unknown
}

export interface PaymentsSummary {
  totalPayments: number
  paidCount: number
  pendingCount: number
  paidAmount: number
  pendingAmount: number
  unpaidAppointments: number
}

export interface PaymentsBundle {
  accessState: AccessState
  items: PaymentItem[]
  unpaidAppointments: AppointmentSummary[]
  summary: PaymentsSummary
  [key: string]: unknown
}

export interface ClientListResponse {
  items: ClientRecord[]
  [key: string]: unknown
}

export interface AnamnesisHistoryBundle {
  clientId: Identifier | null
  latest: AnamnesisRecordVersion | null
  history: AnamnesisRecordVersion[]
  accessState: AccessState
}
