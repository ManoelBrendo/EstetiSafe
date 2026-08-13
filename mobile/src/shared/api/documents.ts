import { requestApi } from './client'
import type { ClinicDocumentSummary, DocumentCategory, DocumentsSummaryResponse } from '../types/operations'

export interface CreateDocumentPayload {
  category: DocumentCategory
  documentType: string
  title: string
  notes?: string
  expiresAt?: string
  fileName: string
  fileMimeType?: string
  fileDataUrl: string
}

export const documentsApi = {
  summary() {
    return requestApi<DocumentsSummaryResponse>('/documents/summary')
  },
  list() {
    return requestApi<ClinicDocumentSummary[]>('/documents')
  },
  create(payload: CreateDocumentPayload) {
    return requestApi<ClinicDocumentSummary>('/documents', {
      method: 'POST',
      body: payload,
    })
  },
}
