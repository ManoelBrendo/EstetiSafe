export type ClinicalInsightPriority = 'INFO' | 'WARNING' | 'CRITICAL'

export type ClinicalInsightSource = 'inventory' | 'equipment' | 'anamnesis' | 'protocol'

export type ClinicalInsightKind =
  | 'LOW_STOCK'
  | 'EXPIRED_PRODUCT'
  | 'PRODUCT_EXPIRING_SOON'
  | 'MAINTENANCE_OVERDUE'
  | 'MAINTENANCE_DUE_SOON'
  | 'ALLERGY_REVIEW'
  | 'MEDICATION_REVIEW'
  | 'CLINICAL_CONDITION_REVIEW'
  | 'PREGNANCY_ATTENTION'

export type ClinicalInsight = {
  id: string
  source: ClinicalInsightSource
  kind: ClinicalInsightKind
  priority: ClinicalInsightPriority
  title: string
  description: string
  evidence: string[]
  actionLabel: string
  metadata?: Record<string, unknown>
}

export type ClinicalInsightsInput = {
  products?: Array<Record<string, unknown>>
  equipmentItems?: Array<Record<string, unknown>>
  anamnesis?: { answers?: Record<string, unknown> } | Record<string, unknown> | null
  limit?: number
}

export type ClinicalInsightsSummary = {
  mode: 'deterministic'
  externalAiEnabled: false
  generatedAt: string
  total: number
  countsByPriority: Record<ClinicalInsightPriority, number>
  insights: ClinicalInsight[]
  message: string
}