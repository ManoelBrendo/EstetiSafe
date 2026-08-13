import { describe, expect, it } from 'vitest'
import { createDocumentTemplateFile } from './documentTemplates'

describe('createDocumentTemplateFile', () => {
  it('generates a downloadable HTML model for procedure-specific missing documents', () => {
    const template = createDocumentTemplateFile({
      requirement: 'Termo de consentimento para laser e fototerapia',
      category: 'CLIENTS',
      categoryLabel: 'Clientes',
      clinicName: 'Clínica Demo',
      sourceScopeLabels: ['Laser e tecnologias'],
      generatedAt: '2026-05-09T12:00:00.000Z',
    })

    expect(template.fileName).toBe('modelo-lappui-termo-de-consentimento-para-laser-e-fototerapia.html')
    expect(template.fileMimeType).toContain('text/html')
    expect(decodeURIComponent(template.fileDataUrl)).toContain('Laser e tecnologias')
    expect(decodeURIComponent(template.fileDataUrl)).toContain('Clínica Demo')
  })
})
