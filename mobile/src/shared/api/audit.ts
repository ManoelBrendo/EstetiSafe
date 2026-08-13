import { requestApi } from './client'
import type { AuditLogItem, AuditLogsResponse } from '../types/operations'

function normalizeAuditResponse(response: AuditLogsResponse | AuditLogItem[]): AuditLogItem[] {
  return Array.isArray(response) ? response : response.logs || []
}

export const auditApi = {
  async list() {
    const response = await requestApi<AuditLogsResponse | AuditLogItem[]>('/audit-logs')
    return normalizeAuditResponse(response)
  },
}
