import { describe, expect, it } from 'vitest'
import {
  clampScore,
  riskLevelFromScore,
  calculateClinicalScore,
  calculateProductScore,
  calculateEquipmentScore,
  calculateProfessionalProfileScore,
  calculateServicesScore,
  calculateBillingScore,
} from './complianceResolver'

describe('complianceResolver business rules', () => {
  describe('clampScore', () => {
    it('normalizes score integers between 0 and 100', () => {
      expect(clampScore(120)).toBe(100)
      expect(clampScore(-15)).toBe(0)
      expect(clampScore(78.6)).toBe(79)
      expect(clampScore(NaN)).toBe(0)
      expect(clampScore(Infinity)).toBe(0)
    })
  })

  describe('riskLevelFromScore', () => {
    it('identifies critical risk levels', () => {
      expect(riskLevelFromScore(45)).toBe('CRITICAL')
      expect(riskLevelFromScore(85, true)).toBe('CRITICAL') // Has critical override
    })

    it('identifies warning risk levels', () => {
      expect(riskLevelFromScore(75)).toBe('WARNING')
      expect(riskLevelFromScore(85)).toBe('WARNING')
    })

    it('identifies stable OK risk levels', () => {
      expect(riskLevelFromScore(90)).toBe('OK')
      expect(riskLevelFromScore(100)).toBe('OK')
    })
  })

  describe('calculateClinicalScore', () => {
    it('reduces score based on sensitive gaps and lack of active events', () => {
      // Perfect score
      expect(calculateClinicalScore(0, true)).toBe(100)
      // Small penalty for no clinical events
      expect(calculateClinicalScore(0, false)).toBe(88)
      // Severe penalties for gaps
      expect(calculateClinicalScore(2, true)).toBe(56)
    })
  })

  describe('calculateProductScore', () => {
    it('computes correct product validity scores', () => {
      // Perfect score
      expect(calculateProductScore(0, 0, 10)).toBe(100)
      // No items in inventory penalty
      expect(calculateProductScore(0, 0, 0)).toBe(90)
      // High penalties for expired
      expect(calculateProductScore(1, 1, 10)).toBe(65)
    })
  })

  describe('calculateEquipmentScore', () => {
    it('computes calibration compliance scores', () => {
      expect(calculateEquipmentScore(0, 0, 5)).toBe(100)
      expect(calculateEquipmentScore(1, 0, 5)).toBe(72)
    })
  })

  describe('calculateProfessionalProfileScore', () => {
    it('calculates profile completeness', () => {
      expect(calculateProfessionalProfileScore(4, 1)).toBe(89)
      expect(calculateProfessionalProfileScore(0, 0)).toBe(72)
    })
  })

  describe('calculateServicesScore', () => {
    it('calculates procedure POP coverage', () => {
      expect(calculateServicesScore(2, 0)).toBe(100)
      expect(calculateServicesScore(2, 1)).toBe(77)
    })
  })

  describe('calculateBillingScore', () => {
    it('penalizes active blocks and overdue payments', () => {
      // OK billing status
      expect(calculateBillingScore(false, 0, 'ACTIVE', 0)).toBe(100)
      // Blocked billing status
      expect(calculateBillingScore(true, 0, 'BLOCKED', 0)).toBe(42)
      // Overdue payments
      expect(calculateBillingScore(false, 1, 'OVERDUE', 1)).toBe(54)
    })
  })
})
