import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createEmptyAnamnesisForm } from './anamnesis'
import {
  createClientRecord,
  downloadClientMedicalRecordPdf,
  getClientMedicalRecord,
  listClientRecords,
  saveClientAnamnesis,
} from './clientRecordsApi'

const apiMock = vi.hoisted(() => ({
  get: vi.fn(),
  post: vi.fn(),
  patch: vi.fn(),
  put: vi.fn(),
  downloadApiFile: vi.fn(),
}))

vi.mock('./api', () => ({
  default: {
    get: apiMock.get,
    post: apiMock.post,
    patch: apiMock.patch,
    put: apiMock.put,
  },
  downloadApiFile: apiMock.downloadApiFile,
}))

describe('client records API normalization', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('normalizes client list responses and keeps access state safe', async () => {
    apiMock.get.mockResolvedValueOnce({
      data: {
        items: [
          {
            id: 7,
            fullName: 'Ana Cliente',
            accessState: {
              isPaid: true,
              isLocked: true,
              lockedAt: '2026-04-29T10:00:00.000Z',
              allowedActions: {
                editAnamnesis: false,
              },
            },
            appointments: null,
            anamneses: null,
            consentRecords: null,
            payments: null,
          },
        ],
      },
    })

    const response = await listClientRecords({ search: 'ana' })

    expect(apiMock.get).toHaveBeenCalledWith('/api/v2/clients', {
      params: { search: 'ana' },
    })
    expect(response.items).toHaveLength(1)
    expect(response.items[0].name).toBe('Ana Cliente')
    expect(response.items[0].appointments).toEqual([])
    expect(response.items[0].anamneses).toEqual([])
    expect(response.items[0].isLocked).toBe(true)
    expect(response.items[0].allowedActions.view).toBe(true)
    expect(response.items[0].allowedActions.editAnamnesis).toBe(false)
  })

  it('trims client payloads and preserves the identification photo', async () => {
    apiMock.post.mockResolvedValueOnce({
      data: {
        id: 11,
        name: 'Ana Cliente',
        photoDataUrl: 'data:image/png;base64,abc',
      },
    })

    const created = await createClientRecord({
      fullName: '  Ana Cliente  ',
      phone: ' 11999999999 ',
      email: ' ana@clinica.com ',
      cpf: ' 123.456.789-10 ',
      photoDataUrl: 'data:image/png;base64,abc',
    })

    expect(apiMock.post).toHaveBeenCalledWith('/api/v2/clients', expect.objectContaining({
      fullName: 'Ana Cliente',
      phone: '11999999999',
      email: 'ana@clinica.com',
      cpf: '123.456.789-10',
      photoDataUrl: 'data:image/png;base64,abc',
    }))
    expect(created.photoDataUrl).toBe('data:image/png;base64,abc')
  })

  it('fills safe defaults for medical record security blocks from partial API data', async () => {
    apiMock.get.mockResolvedValueOnce({
      data: {
        client: {
          id: 22,
          name: 'Cliente Segurança',
          accessState: {
            isPaid: true,
            isLocked: false,
          },
        },
        security: {
          auditTrail: {
            enabled: false,
            sensitiveActions: 'invalid-shape',
          },
          photoConsent: {
            photoCount: '2',
            clinicalUseAuthorized: 1,
            needsAttention: 1,
          },
        },
      },
    })

    const bundle = await getClientMedicalRecord(22)

    expect(apiMock.get).toHaveBeenCalledWith('/api/v2/medical-records/by-client/22')
    expect(bundle.security?.auditTrail.enabled).toBe(false)
    expect(bundle.security?.auditTrail.sensitiveActions).toEqual([])
    expect(bundle.security?.photoConsent.photoCount).toBe(2)
    expect(bundle.security?.photoConsent.clinicalUseAuthorized).toBe(true)
    expect(bundle.security?.photoConsent.formalConsentStatus).toBe('MISSING')
    expect(bundle.security?.photoConsent.needsAttention).toBe(true)
  })

  it('sends a structured anamnesis payload with photo consent awareness', async () => {
    const form = createEmptyAnamnesisForm({ name: 'Ana Cliente' })
    form.identification.fullName = 'Ana Cliente'
    form.identification.email = 'ana@clinica.com'
    form.identification.phone = '(11) 99999-9999'
    form.identification.cpf = '123.456.789-10'
    form.photoRecord.clinicalUseAuthorized = true
    form.photoRecord.consentAwarenessConfirmed = true
    form.photoRecord.photos = [
      { id: 'photo-1', caption: 'Antes', dataUrl: 'data:image/png;base64,abc' },
    ]

    apiMock.put.mockResolvedValueOnce({
      data: {
        client: { id: 22, name: 'Ana Cliente' },
        accessState: { isPaid: false, isLocked: false },
      },
    })

    await saveClientAnamnesis(22, form)

    expect(apiMock.put).toHaveBeenCalledWith(
      '/api/v2/medical-records/by-client/22/anamnesis',
      expect.objectContaining({
        client: expect.objectContaining({
          fullName: 'Ana Cliente',
          email: 'ana@clinica.com',
          phone: '(11) 99999-9999',
          cpf: '12345678910',
        }),
        answers: expect.objectContaining({
          photoRecord: expect.objectContaining({
            clinicalUseAuthorized: true,
            consentAwarenessConfirmed: true,
            consentAcceptedAt: expect.any(String),
            photos: [expect.objectContaining({ id: 'photo-1' })],
          }),
        }),
      })
    )
  })

  it('downloads medical record PDFs with a readable slugged filename', async () => {
    await downloadClientMedicalRecordPdf(33, 'Clínica Áurea / Ana')

    expect(apiMock.downloadApiFile).toHaveBeenCalledWith(
      '/api/v2/pdf/medical-records/by-client/33',
      'prontuario-clinica-aurea-ana.pdf'
    )
  })
})