const assert = require('node:assert/strict')
const test = require('node:test')

const {
  buildPrivacyDataMap,
  buildPrivacySummary,
} = require('../src/legacy/privacy')

test('buildPrivacyDataMap classifies clinical data as critical', () => {
  const map = buildPrivacyDataMap({
    clients: 3,
    anamneses: 2,
    consentRecords: 1,
    intercurrences: 1,
  })

  const anamnesis = map.find(item => item.key === 'anamneses')
  const consents = map.find(item => item.key === 'consentRecords')
  const intercurrences = map.find(item => item.key === 'intercurrences')

  assert.equal(anamnesis.sensitivity, 'CRITICA')
  assert.equal(consents.sensitivity, 'CRITICA')
  assert.equal(intercurrences.sensitivity, 'CRITICA')
})

test('buildPrivacySummary exposes retention and controls without raw sensitive data', () => {
  const summary = buildPrivacySummary({
    counts: {
      clients: 1,
      anamneses: 1,
      consentRecords: 1,
      auditLogs: 4,
    },
    generatedAt: new Date('2026-04-29T12:00:00.000Z'),
  })

  assert.equal(summary.generatedAt, '2026-04-29T12:00:00.000Z')
  assert.ok(summary.criticalAreas.includes('anamneses'))
  assert.ok(summary.retentionPolicy.length >= 3)
  assert.ok(summary.securityControls.some(control => control.key === 'deletion_review'))
  assert.match(summary.message, /sem expor conteudo sensivel/i)
})
