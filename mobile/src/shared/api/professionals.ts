import { requestApi } from './client'
import type { ProfessionalSummary } from '../types/operations'

export interface CreateProfessionalPayload {
  name: string
  specialty: string
  phone?: string
  notes?: string
  active?: boolean
}

export const professionalsApi = {
  list() {
    return requestApi<ProfessionalSummary[]>('/professionals')
  },
  create(payload: CreateProfessionalPayload) {
    return requestApi<ProfessionalSummary>('/professionals', {
      method: 'POST',
      body: payload,
    })
  },
}
