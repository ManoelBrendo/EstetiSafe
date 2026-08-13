export interface StockLevelResult {
  percentage: number
  isCritical: boolean
  label: string
}

export interface MaintenanceAlertResult {
  daysRemaining: number | null
  severity: 'none' | 'success' | 'warning' | 'error'
  message: string
}

/**
 * Calcula o nível de estoque com base na quantidade atual e um mínimo desejado.
 * Retorna o percentual do progresso de estoque e se o estado é crítico.
 */
export function getProductStockLevel(
  quantity: number,
  minQuantity: number = 5
): StockLevelResult {
  const normQuantity = Math.max(0, quantity)
  const normMin = Math.max(0, minQuantity)

  if (normQuantity === 0) {
    return {
      percentage: 0,
      isCritical: true,
      label: 'Sem estoque',
    }
  }

  // Define um teto confortável de estoque (2x a quantidade mínima)
  const targetMax = normMin * 2 || 10
  const percentage = Math.round(Math.min(100, (normQuantity / targetMax) * 100))
  const isCritical = normQuantity <= normMin

  return {
    percentage,
    isCritical,
    label: isCritical ? 'Estoque crítico' : 'Estoque regular',
  }
}

/**
 * Calcula os dias restantes e a severidade da calibração de um equipamento de estética.
 */
import { parseSafeDate } from './dateUtils'

export function getEquipmentMaintenanceAlert(
  maintenanceDueAt: string | Date | null
): MaintenanceAlertResult {
  if (!maintenanceDueAt) {
    return {
      daysRemaining: null,
      severity: 'none',
      message: 'Sem calibração agendada',
    }
  }

  const dueDate = parseSafeDate(maintenanceDueAt)
  if (!dueDate) {
    return {
      daysRemaining: null,
      severity: 'none',
      message: 'Data de manutenção inválida',
    }
  }

  // Zera as horas para cálculo em dias inteiros
  const today = new Date()
  today.setHours(0, 0, 0, 0)
  dueDate.setHours(0, 0, 0, 0)

  const diffTime = dueDate.getTime() - today.getTime()
  const daysRemaining = Math.ceil(diffTime / (1000 * 60 * 60 * 24))

  if (daysRemaining < 0) {
    return {
      daysRemaining,
      severity: 'error',
      message: 'Calibração vencida!',
    }
  }

  if (daysRemaining <= 7) {
    return {
      daysRemaining,
      severity: 'error',
      message: `Atenção: Vence em ${daysRemaining} dia(s)`,
    }
  }

  if (daysRemaining <= 30) {
    return {
      daysRemaining,
      severity: 'warning',
      message: `Vence em ${daysRemaining} dia(s)`,
    }
  }

  return {
    daysRemaining,
    severity: 'success',
    message: `Calibração em dia (${daysRemaining} dias)`,
  }
}
