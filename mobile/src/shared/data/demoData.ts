import type {
  AuditLogItem,
  ClinicDocumentSummary,
  DocumentsSummaryResponse,
  ProfessionalSummary,
} from '../types/operations'

export const demoDocumentsSummary: DocumentsSummaryResponse = {
  total: 6,
  valid: 4,
  expiring: 1,
  expired: 1,
  missingCount: 2,
  complianceScore: 72,
  lastUpdatedAt: '2026-05-04T10:00:00.000Z',
}

export const demoDocuments: ClinicDocumentSummary[] = [
  {
    id: 'demo-doc-1',
    title: 'Alvara sanitario',
    category: 'SANITARY',
    categoryLabel: 'Sanitario',
    documentType: 'Licenca',
    status: 'EXPIRING',
    statusLabel: 'Vencendo',
    expiresAt: '2026-06-12',
    updatedAt: '2026-05-02T09:20:00.000Z',
  },
  {
    id: 'demo-doc-2',
    title: 'Contrato social',
    category: 'LEGAL',
    categoryLabel: 'Legal',
    documentType: 'Empresa',
    status: 'VALID',
    statusLabel: 'Em dia',
    expiresAt: null,
    updatedAt: '2026-04-28T15:30:00.000Z',
  },
  {
    id: 'demo-doc-3',
    title: 'PGRSS',
    category: 'WASTE',
    categoryLabel: 'Residuos',
    documentType: 'Operacional',
    status: 'EXPIRED',
    statusLabel: 'Vencido',
    expiresAt: '2026-04-30',
    updatedAt: '2026-04-20T11:00:00.000Z',
  },
]

export const demoAuditLogs: AuditLogItem[] = [
  {
    id: 'audit-1',
    action: 'DOCUMENT_EXPIRING',
    category: 'DOCUMENTS',
    severity: 'HIGH',
    entityType: 'ClinicDocument',
    description: 'Alvara sanitario esta proximo do vencimento.',
    createdAt: '2026-05-04T08:30:00.000Z',
  },
  {
    id: 'audit-2',
    action: 'PROFESSIONAL_PROFILE_UPDATED',
    category: 'PROFESSIONALS',
    severity: 'MEDIUM',
    entityType: 'Professional',
    description: 'Cadastro profissional revisado pela equipe.',
    createdAt: '2026-05-03T16:20:00.000Z',
  },
  {
    id: 'audit-3',
    action: 'DOCUMENT_DOWNLOADED',
    category: 'DOCUMENTS',
    severity: 'LOW',
    entityType: 'ClinicDocument',
    description: 'Documento consultado para conferencia interna.',
    createdAt: '2026-05-02T14:45:00.000Z',
  },
]

export const demoProfessionals: ProfessionalSummary[] = [
  {
    id: 'pro-1',
    name: 'Ana Clara Rocha',
    specialty: 'Esteticista facial',
    phone: '(11) 99999-0000',
    active: true,
    availabilitySummary: 'Seg a sex, 09:00 as 18:00',
    compensationSummary: 'Comissao ativa',
    payroll: {
      completedAppointments: 12,
      grossRevenue: 4200,
      estimatedPayout: 1260,
    },
  },
  {
    id: 'pro-2',
    name: 'Marina Lopes',
    specialty: 'Biomedica estetica',
    phone: '(11) 98888-0000',
    active: true,
    availabilitySummary: 'Ter a sab, 10:00 as 19:00',
    compensationSummary: 'Modelo hibrido',
    payroll: {
      completedAppointments: 8,
      grossRevenue: 3600,
      estimatedPayout: 1440,
    },
  },
]
