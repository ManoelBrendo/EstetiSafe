const test = require('node:test')
const assert = require('node:assert/strict')

const {
  buildAutomaticBillingQuery,
  expireStaleBillingGatewayIntents,
  runAutomaticBillingCycle,
} = require('../src/legacy/billingAutomation')

const now = new Date('2026-04-28T12:00:00.000Z')

function createDueSubscription(overrides = {}) {
  return {
    id: 1,
    clinicId: 44,
    status: 'ACTIVE',
    amount: 199.9,
    nextDueAt: new Date('2026-04-29T10:00:00.000Z'),
    graceEndsAt: null,
    updatedAt: new Date('2026-04-20T10:00:00.000Z'),
    clinic: {
      id: 44,
      status: 'ACTIVE',
      ownerUser: {
        id: 9,
        email: 'clinica@example.com',
        billingStatus: 'ACTIVE',
        billingAmount: 199.9,
        billingGraceEndsAt: null,
        billingNextDueAt: new Date('2026-04-29T10:00:00.000Z'),
        billingNotes: null,
        ownedClinic: {
          id: 44,
          subscription: {
            amount: 199.9,
            nextDueAt: new Date('2026-04-29T10:00:00.000Z'),
          },
        },
      },
    },
    ...overrides,
  }
}

function createPrismaMock({ subscriptions = [createDueSubscription()], existingIntent = null, staleIntents = [] } = {}) {
  const calls = {
    query: null,
    intents: [],
    events: [],
    audits: [],
    updates: [],
    expiredIds: [],
  }

  const prisma = {
    clinicSubscription: {
      findMany: async (query) => {
        calls.query = query
        return subscriptions
      },
    },
    billingGatewayIntent: {
      findMany: async () => staleIntents,
      updateMany: async (args) => {
        calls.expiredIds = args.where.id.in
        return { count: args.where.id.in.length }
      },
      findFirst: async () => existingIntent,
      create: async (args) => {
        calls.intents.push(args)
        return {
          id: 100 + calls.intents.length,
          ...args.data,
          createdAt: now,
          updatedAt: now,
          events: [],
        }
      },
      findUnique: async (args) => {
        const created = calls.intents[calls.intents.length - 1].data
        return {
          id: args.where.id,
          ...created,
          createdAt: now,
          updatedAt: now,
          events: calls.events,
        }
      },
    },
    billingGatewayEvent: {
      create: async (args) => {
        calls.events.push(args)
        return args.data
      },
    },
    user: {
      update: async (args) => {
        calls.updates.push({ model: 'user', args })
        return args
      },
    },
    clinic: {
      update: async (args) => {
        calls.updates.push({ model: 'clinic', args })
        return args
      },
    },
    auditLog: {
      create: async (args) => {
        calls.audits.push(args)
        return args.data
      },
    },
    $transaction: async (operations) => Promise.all(operations),
  }

  return { prisma, calls }
}

test('buildAutomaticBillingQuery selects due subscriptions in the configured window', () => {
  const query = buildAutomaticBillingQuery(now, 5, 30)

  assert.deepEqual(query.where.status.in, ['TRIAL', 'ACTIVE', 'OVERDUE', 'BLOCKED'])
  assert.equal(query.take, 30)
  assert.equal(query.where.OR[0].nextDueAt.lte.toISOString(), '2026-05-03T12:00:00.000Z')
  assert.deepEqual(query.orderBy, [{ nextDueAt: 'asc' }, { updatedAt: 'asc' }])
})

test('runAutomaticBillingCycle creates one automatic intent and audit log', async () => {
  const { prisma, calls } = createPrismaMock()

  const summary = await runAutomaticBillingCycle({
    prisma,
    now,
    env: {
      BILLING_AUTO_CHARGE_ENABLED: 'true',
      BILLING_AUTO_LOOKAHEAD_DAYS: '3',
      BILLING_AUTO_METHOD: 'PIX',
    },
    logger: { error() {}, info() {} },
  })

  assert.equal(summary.created, 1)
  assert.equal(summary.skipped, 0)
  assert.equal(summary.failed, 0)
  assert.equal(calls.intents.length, 1)
  assert.equal(calls.intents[0].data.method, 'PIX')
  assert.equal(calls.intents[0].data.status, 'PENDING')
  assert.equal(calls.intents[0].data.payload.source, 'automatic')
  assert.match(calls.intents[0].data.reference, /^LAPPUI-44-[A-Z0-9]+-[A-F0-9]{6}$/)
  assert.equal(calls.audits.length, 1)
  assert.equal(calls.audits[0].data.actorRole, 'SYSTEM')
  assert.equal(calls.audits[0].data.metadata.source, 'automatic_subscription_billing')
})

test('runAutomaticBillingCycle skips a billing cycle that already has an open intent', async () => {
  const { prisma, calls } = createPrismaMock({
    existingIntent: {
      id: 88,
      clinicId: 44,
      reference: 'LAPPUI-44-EXISTING-ABC123',
      status: 'PENDING',
    },
  })

  const summary = await runAutomaticBillingCycle({
    prisma,
    now,
    env: { BILLING_AUTO_CHARGE_ENABLED: 'true' },
    logger: { error() {}, info() {} },
  })

  assert.equal(summary.created, 0)
  assert.equal(summary.skipped, 1)
  assert.equal(summary.results[0].reason, 'existing_cycle_intent')
  assert.equal(calls.intents.length, 0)
  assert.equal(calls.audits.length, 0)
})

test('runAutomaticBillingCycle does not query subscriptions when disabled', async () => {
  const { prisma, calls } = createPrismaMock()

  const summary = await runAutomaticBillingCycle({
    prisma,
    now,
    env: { BILLING_AUTO_CHARGE_ENABLED: 'false' },
    logger: { error() {}, info() {} },
  })

  assert.equal(summary.enabled, false)
  assert.equal(summary.created, 0)
  assert.equal(calls.query, null)
})

test('expireStaleBillingGatewayIntents expires pending intents and writes events', async () => {
  const staleIntent = {
    id: 7,
    clinicId: 44,
    reference: 'LAPPUI-44-OLD-ABC123',
    provider: 'TEST_GATEWAY',
  }
  const { prisma, calls } = createPrismaMock({ staleIntents: [staleIntent] })

  const expired = await expireStaleBillingGatewayIntents({ prisma, now })

  assert.equal(expired, 1)
  assert.deepEqual(calls.expiredIds, [7])
  assert.equal(calls.events.length, 1)
  assert.equal(calls.events[0].data.eventType, 'INTENT_EXPIRED_AUTOMATICALLY')
  assert.equal(calls.events[0].data.status, 'EXPIRED')
})