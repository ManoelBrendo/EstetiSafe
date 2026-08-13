import { describe, expect, it } from 'vitest'
import { buildExpiredDocumentCorrectiveTasks, anvisaChecklistItems } from './Auditoria'
import type { ClinicDocumentSummary, AuditCorrectiveAction } from './operationsTypes'

describe('Auditoria Conformidade ANVISA e Validades', () => {
  it('contém todos os itens regulamentares do checklist da ANVISA', () => {
    expect(anvisaChecklistItems).toHaveLength(9)

    const categories = anvisaChecklistItems.map(x => x.category)
    expect(categories).toContain('Descarte de Resíduos')
    expect(categories).toContain('Higienização de Cabines')
    expect(categories).toContain('Rotina de Esterilização')

    const ids = anvisaChecklistItems.map(x => x.id)
    expect(ids).toContain('anvisa-descarte-perfurocortantes')
    expect(ids).toContain('anvisa-desinfeccao-macas')
    expect(ids).toContain('anvisa-teste-autoclave')
  })

  it('gera tarefas corretivas para licenças e documentos expirados (EXPIRED) com criticidade CRITICAL', () => {
    const mockDocuments: ClinicDocumentSummary[] = [
      {
        id: 101,
        category: 'SANITARY',
        documentType: 'Alvará Sanitário',
        title: 'Alvará Sanitário da Clínica',
        status: 'EXPIRED',
        statusLabel: 'Vencido',
        expiresAt: '2026-05-10T12:00:00Z',
        createdAt: '2025-05-10T12:00:00Z',
        updatedAt: '2025-05-10T12:00:00Z',
        fileName: 'alvara.pdf'
      }
    ]

    const savedActions = new Map<string, AuditCorrectiveAction>()

    const tasks = buildExpiredDocumentCorrectiveTasks(mockDocuments, savedActions)

    expect(tasks).toHaveLength(1)
    expect(tasks[0].taskKey).toBe('doc-expired-101')
    expect(tasks[0].level).toBe('CRITICAL')
    expect(tasks[0].label).toContain('Substituir')
    expect(tasks[0].owner).toBe('Administrativo')
    expect(tasks[0].due).toBe('48h')
    expect(tasks[0].status).toBe('OPEN')
  })

  it('gera tarefas corretivas para licenças e documentos próximos de expirar (EXPIRING) com criticidade WARNING', () => {
    const mockDocuments: ClinicDocumentSummary[] = [
      {
        id: 102,
        category: 'SANITARY',
        documentType: 'Licença da VISA',
        title: 'Licença VISA 2026',
        status: 'EXPIRING',
        statusLabel: 'Vence em 10 dias',
        expiresAt: '2026-06-20T12:00:00Z',
        createdAt: '2025-06-20T12:00:00Z',
        updatedAt: '2025-06-20T12:00:00Z',
        fileName: 'licenca.pdf'
      }
    ]

    const savedActions = new Map<string, AuditCorrectiveAction>()

    const tasks = buildExpiredDocumentCorrectiveTasks(mockDocuments, savedActions)

    expect(tasks).toHaveLength(1)
    expect(tasks[0].taskKey).toBe('doc-expired-102')
    expect(tasks[0].level).toBe('WARNING')
    expect(tasks[0].label).toContain('Renovar')
    expect(tasks[0].owner).toBe('Administrativo')
    expect(tasks[0].due).toBe('15 dias')
    expect(tasks[0].status).toBe('OPEN')
  })

  it('utiliza definições salvas no banco para tarefas de documentos vencidos/vencendo', () => {
    const mockDocuments: ClinicDocumentSummary[] = [
      {
        id: 103,
        category: 'SANITARY',
        documentType: 'Alvará Sanitário',
        title: 'Alvará Sanitário',
        status: 'EXPIRED',
        statusLabel: 'Vencido',
        expiresAt: '2026-05-10T12:00:00Z',
        createdAt: '2025-05-10T12:00:00Z',
        updatedAt: '2025-05-10T12:00:00Z',
        fileName: 'alvara.pdf'
      }
    ]

    const savedActions = new Map<string, AuditCorrectiveAction>([
      [
        'doc-expired-103',
        {
          id: 50,
          taskKey: 'doc-expired-103',
          domainId: 'documents',
          domainTitle: 'Documentos Sanitários',
          title: 'Substituir Alvará Sanitário URGENTE',
          owner: 'Dra. Responsável Técnico',
          dueLabel: '24h',
          dueAt: null,
          evidence: 'Ação corretiva atribuída diretamente.',
          actionUrl: '/documentos',
          riskLevel: 'CRITICAL',
          status: 'IN_PROGRESS',
          attachments: [],
          createdAt: '2026-06-09T12:00:00Z',
          updatedAt: '2026-06-09T12:00:00Z'
        }
      ]
    ])

    const tasks = buildExpiredDocumentCorrectiveTasks(mockDocuments, savedActions)

    expect(tasks).toHaveLength(1)
    expect(tasks[0].taskKey).toBe('doc-expired-103')
    expect(tasks[0].label).toBe('Substituir Alvará Sanitário URGENTE')
    expect(tasks[0].owner).toBe('Dra. Responsável Técnico')
    expect(tasks[0].due).toBe('24h')
    expect(tasks[0].status).toBe('IN_PROGRESS')
  })
})
