import { format } from 'date-fns'
import type { AppointmentRecord, AppointmentStatus } from './operationsTypes'

export interface TimeInterval {
  startAt: string | Date
  endAt: string | Date
}

/**
 * Checks if a new time interval overlaps with any of the existing intervals.
 */
export function hasTimeConflict(newInterval: TimeInterval, existingIntervals: TimeInterval[]): boolean {
  const newStart = new Date(newInterval.startAt).getTime()
  const newEnd = new Date(newInterval.endAt).getTime()

  return existingIntervals.some(existing => {
    const existingStart = new Date(existing.startAt).getTime()
    const existingEnd = new Date(existing.endAt).getTime()

    // Overlap condition: (StartA < EndB) and (EndA > StartB)
    return newStart < existingEnd && newEnd > existingStart
  })
}

/**
 * Resolves a text warning reminder based on the appointment starting time.
 */
export function getAppointmentReminder(appointment: AppointmentRecord) {
  if (appointment.status === 'CANCELLED' || appointment.status === 'NO_SHOW') return null

  const now = new Date()
  const startAt = new Date(appointment.startAt)
  const diffMinutes = Math.round((startAt.getTime() - now.getTime()) / 60000)

  if (diffMinutes < 0) return 'Horário já passou; confira status e baixa.'
  if (diffMinutes <= 120) return 'Lembrete: atendimento nas próximas 2h.'
  if (diffMinutes <= 24 * 60) return 'Lembrete sugerido para hoje.'
  if (diffMinutes <= 48 * 60) return 'Lembrete sugerido para amanhã.'

  return null
}

/**
 * Resolves the primary button action state for an appointment based on workflow transitions.
 */
export function getAppointmentPrimaryAction(appointment: AppointmentRecord): { label: string; status: AppointmentStatus } | null {
  if (appointment.status === 'SCHEDULED') return { label: 'Confirmar', status: 'CONFIRMED' }
  if (appointment.status === 'CONFIRMED') return { label: 'Iniciar', status: 'IN_PROGRESS' }
  if (appointment.status === 'IN_PROGRESS') return { label: 'Concluir', status: 'COMPLETED' }

  return null
}

export function formatDateLabel(value?: string) {
  return value ? format(new Date(`${value}T00:00:00`), 'dd/MM/yyyy') : ''
}

export function formatDateRangeTitle(from?: string, to?: string) {
  if (from && to) return `${formatDateLabel(from)} a ${formatDateLabel(to)}`
  if (from) return `A partir de ${formatDateLabel(from)}`
  if (to) return `Até ${formatDateLabel(to)}`
  return 'Todos os períodos'
}

export function toInputDateTime(value?: string | null) {
  if (!value) return ''

  const date = new Date(value)
  const offset = date.getTimezoneOffset() * 60000
  return new Date(date.getTime() - offset).toISOString().slice(0, 16)
}

export function addMinutesToInputDateTime(value: string, minutes: number) {
  if (!value) return ''

  const date = new Date(value)
  date.setMinutes(date.getMinutes() + minutes)
  return toInputDateTime(date.toISOString())
}
