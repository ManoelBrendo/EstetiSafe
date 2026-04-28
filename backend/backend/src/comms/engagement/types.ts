export type EngagementChannel = 'WHATSAPP' | 'EMAIL' | 'PHONE'

export type ReactivationReason = 'NO_RECENT_APPOINTMENT' | 'NO_APPOINTMENT_CREATED'

export type ReactivationPriority = 'LOW' | 'MEDIUM' | 'HIGH'

export type ReactivationCandidate = {
  clientId: number | string
  name: string
  phone: string
  priority: ReactivationPriority
  reason: ReactivationReason
  recommendedChannel: EngagementChannel
  daysSinceLastAppointment: number | null
  daysSinceCreated: number | null
  lastAppointmentAt: string | null
  suggestedMessage: string
}

export type ReactivationSelectionOptions = {
  inactiveDaysThreshold?: number
  newClientDaysThreshold?: number
  limit?: number
  clinicName?: string
}

export type EngagementDashboard = {
  mode: 'selection_only'
  autoSendEnabled: false
  totalClients: number
  eligibleCount: number
  candidates: ReactivationCandidate[]
  message: string
}