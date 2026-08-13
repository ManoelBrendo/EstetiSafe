export type AuditRiskLevel = 'CRITICAL' | 'WARNING' | 'OK'

/**
 * Bounds any calculated score to a valid 0-100 integer range.
 */
export function clampScore(value: number): number {
  if (!Number.isFinite(value)) return 0
  return Math.max(0, Math.min(100, Math.round(value)))
}

/**
 * Mapped risk severity from a compliance score index.
 */
export function riskLevelFromScore(score: number, hasCritical = false): AuditRiskLevel {
  if (hasCritical || score < 60) return 'CRITICAL'
  if (score < 86) return 'WARNING'
  return 'OK'
}

export function calculateClinicalScore(clinicalSensitiveGaps: number, hasClinicalEvents: boolean): number {
  return clampScore(100 - clinicalSensitiveGaps * 22 - (hasClinicalEvents ? 0 : 12))
}

export function calculateProductScore(expiredProducts: number, expiringProducts: number, totalProducts: number): number {
  return clampScore(100 - expiredProducts * 26 - expiringProducts * 9 - (totalProducts ? 0 : 10))
}

export function calculateEquipmentScore(overdueEquipment: number, dueEquipment: number, totalEquipment: number): number {
  return clampScore(100 - overdueEquipment * 28 - dueEquipment * 10 - (totalEquipment ? 0 : 10))
}

export function calculateProfessionalProfileScore(activeCount: number, gapsCount: number): number {
  return activeCount ? clampScore(100 - (gapsCount / activeCount) * 46) : 72
}

export function calculateServicesScore(activeCount: number, withoutPopCount: number): number {
  return activeCount ? clampScore(100 - (withoutPopCount / activeCount) * 46) : 72
}

export function calculateBillingScore(billingBlocked: boolean, overdueBills: number, billingStatus: string, openBills: number): number {
  return clampScore(100 - (billingBlocked ? 58 : 0) - overdueBills * 18 - (billingStatus === 'OVERDUE' ? 28 : 0) - (openBills && !overdueBills ? 8 : 0))
}
