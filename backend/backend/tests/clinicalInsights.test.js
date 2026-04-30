const test = require('node:test')
const assert = require('node:assert/strict')

const {
  buildAiReadiness,
  buildClinicalInsights,
  buildInventoryPredictiveInsights,
  extractAnamnesisRiskSignals,
} = require('../src/legacy/clinicalInsights')

function isoDateFromOffset(daysOffset) {
  const date = new Date()
  date.setDate(date.getDate() + daysOffset)
  return date.toISOString()
}

test('buildInventoryPredictiveInsights flags expired products and low stock', () => {
  const insights = buildInventoryPredictiveInsights([
    {
      id: 1,
      name: 'Toxina botulinica',
      batch: 'L1',
      quantity: 0,
      unit: 'un',
      entryMode: 'NEW',
      expiresAt: isoDateFromOffset(-2),
      active: true,
    },
  ], [])

  assert.equal(insights[0].kind, 'EXPIRED_PRODUCT')
  assert.equal(insights[0].priority, 'CRITICAL')
  assert.ok(insights.some(insight => insight.kind === 'LOW_STOCK'))
})

test('buildInventoryPredictiveInsights flags upcoming equipment maintenance', () => {
  const insights = buildInventoryPredictiveInsights([], [
    {
      id: 5,
      name: 'Laser facial',
      serialNumber: 'ABC-123',
      entryMode: 'EXISTING',
      maintenanceDueAt: isoDateFromOffset(7),
      active: true,
    },
  ])

  assert.equal(insights.length, 1)
  assert.equal(insights[0].kind, 'MAINTENANCE_DUE_SOON')
  assert.equal(insights[0].priority, 'WARNING')
})

test('extractAnamnesisRiskSignals highlights clinical review points without flagging negative pregnancy answers', () => {
  const insights = extractAnamnesisRiskSignals({
    answers: {
      allergies: 'Lidocaina',
      pregnancyStatus: 'nao',
      medications: 'Uso de anticoagulante',
    },
  })

  const kinds = insights.map(insight => insight.kind)

  assert.ok(kinds.includes('ALLERGY_REVIEW'))
  assert.ok(kinds.includes('MEDICATION_REVIEW'))
  assert.ok(!kinds.includes('PREGNANCY_ATTENTION'))
})

test('extractAnamnesisRiskSignals flags affirmative pregnancy answers', () => {
  const insights = extractAnamnesisRiskSignals({
    answers: {
      pregnancyStatus: 'sim',
    },
  })

  assert.equal(insights.length, 1)
  assert.equal(insights[0].kind, 'PREGNANCY_ATTENTION')
  assert.equal(insights[0].priority, 'CRITICAL')
})

test('buildClinicalInsights returns an auditable deterministic summary', () => {
  const summary = buildClinicalInsights({
    now: new Date('2026-04-28T12:00:00.000Z'),
    products: [
      {
        id: 10,
        name: 'Serum calmante',
        quantity: 1,
        unit: 'un',
        entryMode: 'NEW',
        expiresAt: isoDateFromOffset(3),
        active: true,
      },
    ],
    anamnesis: {
      answers: {
        diseases: 'Diabetes controlada',
      },
    },
  })

  assert.equal(summary.mode, 'deterministic')
  assert.equal(summary.externalAiEnabled, false)
  assert.equal(summary.generatedAt, '2026-04-28T12:00:00.000Z')
  assert.equal(summary.total, 3)
  assert.equal(summary.countsByPriority.WARNING, 3)
  assert.equal(summary.insights[0].priority, 'WARNING')
})
test('buildAiReadiness keeps clinical insights auditable by default', () => {
  const readiness = buildAiReadiness({})

  assert.equal(readiness.mode, 'deterministic_rules')
  assert.equal(readiness.externalAiEnabled, false)
  assert.equal(readiness.ready, true)
  assert.ok(readiness.safeguards.includes('human_review_required'))
})

test('buildAiReadiness requires an API key before enabling external AI', () => {
  const readiness = buildAiReadiness({ CLINICAL_AI_ENABLED: 'true', CLINICAL_AI_PROVIDER: 'OPENAI' })

  assert.equal(readiness.externalAiEnabled, false)
  assert.equal(readiness.ready, false)
  assert.deepEqual(readiness.missing, ['CLINICAL_AI_API_KEY'])
})