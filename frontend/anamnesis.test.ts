import { describe, expect, it } from 'vitest'
import { buildAnamnesisPayload, createEmptyAnamnesisForm, normalizeAnamnesisRecord } from './anamnesis'

describe('anamnesis photo consent payload', () => {
  it('starts with awareness confirmation disabled by default', () => {
    const form = createEmptyAnamnesisForm({ name: 'Cliente Teste' })

    expect(form.photoRecord.consentAwarenessConfirmed).toBe(false)
  })

  it('sends awareness confirmation when photos are authorized', () => {
    const form = createEmptyAnamnesisForm({ name: 'Cliente Teste' })

    form.photoRecord.clinicalUseAuthorized = true
    form.photoRecord.consentAwarenessConfirmed = true
    form.photoRecord.photos = [
      { id: 'photo-1', caption: 'Antes', dataUrl: 'data:image/png;base64,abc' },
    ]

    const payload = buildAnamnesisPayload(form)

    expect(payload.photoRecord.clinicalUseAuthorized).toBe(true)
    expect(payload.photoRecord.consentAwarenessConfirmed).toBe(true)
    expect(payload.photoRecord.photos).toHaveLength(1)
    expect(payload.photoRecord.consentAcceptedAt).toEqual(expect.any(String))
  })

  it('normalizes legacy consent dates as awareness confirmation for existing records', () => {
    const normalized = normalizeAnamnesisRecord({
      id: 1,
      answers: {
        identification: {},
        chiefComplaint: {},
        photoRecord: {
          clinicalUseAuthorized: true,
          consentAcceptedAt: '2026-04-28T12:00:00.000Z',
          photos: [],
        },
      },
    })

    expect(normalized.photoRecord.consentAwarenessConfirmed).toBe(true)
  })
})