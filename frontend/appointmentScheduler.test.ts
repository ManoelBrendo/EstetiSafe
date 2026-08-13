import { describe, expect, it } from 'vitest'
import {
  hasTimeConflict,
  getAppointmentReminder,
  getAppointmentPrimaryAction,
  formatDateRangeTitle,
  addMinutesToInputDateTime,
} from './appointmentScheduler'
import type { AppointmentRecord } from './operationsTypes'

describe('appointmentScheduler logic helpers', () => {
  describe('hasTimeConflict', () => {
    const existing = [
      { startAt: '2026-06-15T09:00:00Z', endAt: '2026-06-15T10:00:00Z' },
      { startAt: '2026-06-15T11:00:00Z', endAt: '2026-06-15T12:00:00Z' },
    ]

    it('detects overlap when a new interval conflicts with existing ones', () => {
      // Direct overlap
      expect(hasTimeConflict(
        { startAt: '2026-06-15T09:30:00Z', endAt: '2026-06-15T10:30:00Z' },
        existing
      )).toBe(true)

      // Fully nested inside an existing slot
      expect(hasTimeConflict(
        { startAt: '2026-06-15T09:15:00Z', endAt: '2026-06-15T09:45:00Z' },
        existing
      )).toBe(true)

      // Fully engulfs an existing slot
      expect(hasTimeConflict(
        { startAt: '2026-06-15T08:30:00Z', endAt: '2026-06-15T10:30:00Z' },
        existing
      )).toBe(true)
    })

    it('returns false when there is no overlap', () => {
      // Before existing slots
      expect(hasTimeConflict(
        { startAt: '2026-06-15T08:00:00Z', endAt: '2026-06-15T09:00:00Z' },
        existing
      )).toBe(false)

      // In the gap between slots
      expect(hasTimeConflict(
        { startAt: '2026-06-15T10:00:00Z', endAt: '2026-06-15T11:00:00Z' },
        existing
      )).toBe(false)

      // After slots
      expect(hasTimeConflict(
        { startAt: '2026-06-15T12:00:00Z', endAt: '2026-06-15T13:00:00Z' },
        existing
      )).toBe(false)
    })
  })

  describe('getAppointmentReminder', () => {
    function createMockAppointment(startAtIso: string, status = 'SCHEDULED'): AppointmentRecord {
      return {
        id: 1,
        clientId: 1,
        serviceId: 1,
        professionalId: 1,
        status: status as any,
        startAt: startAtIso,
        endAt: startAtIso,
        price: 150,
        createdAt: startAtIso,
        updatedAt: startAtIso,
      }
    }

    it('returns null for cancelled or no-show appointments', () => {
      const appt = createMockAppointment('2026-06-15T10:00:00Z', 'CANCELLED')
      expect(getAppointmentReminder(appt)).toBeNull()
    })

    it('returns appropriate warning for past appointments', () => {
      const pastTime = new Date(Date.now() - 30 * 60 * 1000).toISOString() // 30 mins ago
      const appt = createMockAppointment(pastTime)
      expect(getAppointmentReminder(appt)).toContain('Horário já passou')
    })

    it('returns warning for appointments in the next 2 hours', () => {
      const soonTime = new Date(Date.now() + 60 * 60 * 1000).toISOString() // 1h from now
      const appt = createMockAppointment(soonTime)
      expect(getAppointmentReminder(appt)).toContain('próximas 2h')
    })
  })

  describe('getAppointmentPrimaryAction', () => {
    function createMockAppointment(status: string): AppointmentRecord {
      return {
        id: 1,
        clientId: 1,
        serviceId: 1,
        professionalId: 1,
        status: status as any,
        startAt: '',
        endAt: '',
        price: 100,
        createdAt: '',
        updatedAt: '',
      }
    }

    it('resolves correct primary actions based on status transitions', () => {
      expect(getAppointmentPrimaryAction(createMockAppointment('SCHEDULED'))).toEqual({
        label: 'Confirmar',
        status: 'CONFIRMED',
      })
      expect(getAppointmentPrimaryAction(createMockAppointment('CONFIRMED'))).toEqual({
        label: 'Iniciar',
        status: 'IN_PROGRESS',
      })
      expect(getAppointmentPrimaryAction(createMockAppointment('IN_PROGRESS'))).toEqual({
        label: 'Concluir',
        status: 'COMPLETED',
      })
      expect(getAppointmentPrimaryAction(createMockAppointment('COMPLETED'))).toBeNull()
    })
  })

  describe('formatDateRangeTitle', () => {
    it('returns formatted range message', () => {
      expect(formatDateRangeTitle('2026-06-15', '2026-06-17')).toBe('15/06/2026 a 17/06/2026')
      expect(formatDateRangeTitle('2026-06-15', '')).toBe('A partir de 15/06/2026')
      expect(formatDateRangeTitle('', '2026-06-17')).toBe('Até 17/06/2026')
      expect(formatDateRangeTitle('', '')).toBe('Todos os períodos')
    })
  })

  describe('addMinutesToInputDateTime', () => {
    it('correctly increments a datetime-local string by minutes', () => {
      expect(addMinutesToInputDateTime('2026-06-15T10:00', 30)).toBe('2026-06-15T10:30')
      expect(addMinutesToInputDateTime('2026-06-15T23:45', 30)).toBe('2026-06-16T00:15')
    })
  })
})
