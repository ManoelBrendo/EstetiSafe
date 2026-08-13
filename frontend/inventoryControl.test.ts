import { describe, it, expect } from 'vitest'
import { getProductStockLevel, getEquipmentMaintenanceAlert } from './inventoryControl'

describe('getProductStockLevel', () => {
  it('should return 0% and critical when quantity is 0', () => {
    const result = getProductStockLevel(0, 5)
    expect(result.percentage).toBe(0)
    expect(result.isCritical).toBe(true)
    expect(result.label).toBe('Sem estoque')
  })

  it('should return critical when quantity is less than or equal to minimum', () => {
    const result = getProductStockLevel(4, 5)
    expect(result.isCritical).toBe(true)
    expect(result.label).toBe('Estoque crítico')
    expect(result.percentage).toBe(40) // 4 / 10 * 100
  })

  it('should return regular when quantity is greater than minimum', () => {
    const result = getProductStockLevel(8, 5)
    expect(result.isCritical).toBe(false)
    expect(result.label).toBe('Estoque regular')
    expect(result.percentage).toBe(80) // 8 / 10 * 100
  })

  it('should cap percentage at 100%', () => {
    const result = getProductStockLevel(15, 5)
    expect(result.percentage).toBe(100)
    expect(result.isCritical).toBe(false)
  })
})

describe('getEquipmentMaintenanceAlert', () => {
  it('should return none when date is missing', () => {
    const result = getEquipmentMaintenanceAlert(null)
    expect(result.daysRemaining).toBeNull()
    expect(result.severity).toBe('none')
    expect(result.message).toBe('Sem calibração agendada')
  })

  it('should return none when date is invalid', () => {
    const result = getEquipmentMaintenanceAlert('not-a-date')
    expect(result.daysRemaining).toBeNull()
    expect(result.severity).toBe('none')
    expect(result.message).toBe('Data de manutenção inválida')
  })

  it('should return error when maintenance is overdue', () => {
    const pastDate = new Date()
    pastDate.setDate(pastDate.getDate() - 5)

    const result = getEquipmentMaintenanceAlert(pastDate)
    expect(result.daysRemaining).toBeLessThan(0)
    expect(result.severity).toBe('error')
    expect(result.message).toBe('Calibração vencida!')
  })

  it('should return warning when maintenance is due in less than 30 days (but more than 7)', () => {
    const warningDate = new Date()
    warningDate.setDate(warningDate.getDate() + 15)

    const result = getEquipmentMaintenanceAlert(warningDate)
    expect(result.daysRemaining).toBeLessThanOrEqual(30)
    expect(result.daysRemaining).toBeGreaterThan(7)
    expect(result.severity).toBe('warning')
    expect(result.message).toContain('Vence em')
  })

  it('should return error when maintenance is due in 7 days or less', () => {
    const urgentDate = new Date()
    urgentDate.setDate(urgentDate.getDate() + 5)

    const result = getEquipmentMaintenanceAlert(urgentDate)
    expect(result.daysRemaining).toBeLessThanOrEqual(7)
    expect(result.daysRemaining).toBeGreaterThan(0)
    expect(result.severity).toBe('error')
    expect(result.message).toContain('Atenção: Vence em')
  })

  it('should return success when maintenance is in a safe range', () => {
    const safeDate = new Date()
    safeDate.setDate(safeDate.getDate() + 45)

    const result = getEquipmentMaintenanceAlert(safeDate)
    expect(result.daysRemaining).toBeGreaterThan(30)
    expect(result.severity).toBe('success')
    expect(result.message).toContain('Calibração em dia')
  })
})
