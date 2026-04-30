const test = require('node:test')
const assert = require('node:assert/strict')

const {
  buildMedicalRecordAuditMetadata,
  buildMedicalRecordSecuritySummary,
  normalizePhotoRecordConsent,
  serializeClientBase,
  summarizeAnamnesis,
} = require('../src/api-v2/lib/medical-records')

test('normalizePhotoRecordConsent blocks photos without awareness confirmation', () => {
  assert.throws(() => normalizePhotoRecordConsent({
    photoRecord: {
      clinicalUseAuthorized: true,
      photos: [{ id: 'photo-1', caption: 'Antes', dataUrl: 'data:image/png;base64,abc' }],
    },
  }), /autorizacao de imagem foi explicada/)
})

test('normalizePhotoRecordConsent preserves authorized photos with audit-ready consent fields', () => {
  const normalized = normalizePhotoRecordConsent({
    photoRecord: {
      clinicalUseAuthorized: true,
      marketingUseAuthorized: false,
      consentAwarenessConfirmed: true,
      photos: [{ id: 'photo-1', caption: 'Antes', dataUrl: 'data:image/png;base64,abc' }],
    },
  })

  assert.equal(normalized.photoRecord.clinicalUseAuthorized, true)
  assert.equal(normalized.photoRecord.marketingUseAuthorized, false)
  assert.equal(normalized.photoRecord.consentAwarenessConfirmed, true)
  assert.equal(normalized.photoRecord.consentVersion, 'photo-consent-v1')
  assert.ok(normalized.photoRecord.consentAcceptedAt)

  const summarized = summarizeAnamnesis({
    id: 1,
    filledAt: '2026-04-28T12:00:00.000Z',
    updatedAt: '2026-04-28T12:00:00.000Z',
    answers: normalized,
  })

  assert.equal(summarized.summary.photoConsent.consentAwarenessConfirmed, true)
  assert.equal(summarized.summary.photoConsent.clinicalUseAuthorized, true)
  assert.equal(summarized.summary.photoCount, 1)
})

test('normalizePhotoRecordConsent clears awareness confirmation when clinical consent is absent', () => {
  const normalized = normalizePhotoRecordConsent({
    photoRecord: {
      consentAwarenessConfirmed: true,
      photos: [],
    },
  })

  assert.equal(normalized.photoRecord.clinicalUseAuthorized, false)
  assert.equal(normalized.photoRecord.consentAwarenessConfirmed, false)
  assert.equal(normalized.photoRecord.consentAcceptedAt, null)
})

test('serializeClientBase includes the client identification photo', () => {
  const serialized = serializeClientBase({
    id: 1,
    name: 'Cliente Foto',
    phone: '11999999999',
    photoDataUrl: 'data:image/png;base64,abc',
    isLocked: false,
  })

  assert.equal(serialized.photoDataUrl, 'data:image/png;base64,abc')
})
test('buildMedicalRecordSecuritySummary marks signed image consent as safe', () => {
  const summary = buildMedicalRecordSecuritySummary({
    id: 10,
    name: 'Cliente Protegida',
    isPaid: true,
    isLocked: true,
    lockedAt: new Date('2026-04-29T10:00:00.000Z'),
    anamneses: [
      {
        id: 1,
        answers: {
          photoRecord: {
            clinicalUseAuthorized: true,
            marketingUseAuthorized: false,
            consentAwarenessConfirmed: true,
            consentAcceptedAt: '2026-04-29T09:00:00.000Z',
            photos: [{ id: 'photo-1', caption: 'Antes', dataUrl: 'data:image/png;base64,abc' }],
          },
        },
      },
    ],
    consentRecords: [
      {
        id: 99,
        title: 'Termo de uso de imagem',
        status: 'SIGNED',
        signedAt: '2026-04-29T09:30:00.000Z',
      },
    ],
  })

  assert.equal(summary.accessState.readOnly, true)
  assert.equal(summary.photoConsent.photoCount, 1)
  assert.equal(summary.photoConsent.clinicalUseAuthorized, true)
  assert.equal(summary.photoConsent.consentAwarenessConfirmed, true)
  assert.equal(summary.photoConsent.formalConsentStatus, 'SIGNED')
  assert.equal(summary.photoConsent.needsAttention, false)
})

test('buildMedicalRecordAuditMetadata flags photo records without formal signed consent', () => {
  const metadata = buildMedicalRecordAuditMetadata({
    id: 11,
    name: 'Cliente com Pendencia',
    isPaid: false,
    isLocked: false,
    anamneses: [
      {
        id: 2,
        answers: {
          photoRecord: {
            clinicalUseAuthorized: true,
            consentAwarenessConfirmed: true,
            photos: [{ id: 'photo-2', caption: 'Depois', dataUrl: 'data:image/png;base64,def' }],
          },
        },
      },
    ],
    consentRecords: [],
  }, '/api/v2/medical-records/by-client/11')

  assert.equal(metadata.path, '/api/v2/medical-records/by-client/11')
  assert.equal(metadata.photoConsent.photoCount, 1)
  assert.equal(metadata.photoConsent.clinicalUseAuthorized, true)
  assert.equal(metadata.photoConsent.consentAwarenessConfirmed, true)
  assert.equal(metadata.photoConsent.formalConsentStatus, 'MISSING')
  assert.equal(metadata.photoConsent.needsAttention, true)
})
