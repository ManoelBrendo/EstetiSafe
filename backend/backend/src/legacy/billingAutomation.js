const {
  createGatewayIntentForSubscription,
  getGatewayAutomationSnapshot,
  toNumber,
} = require('./billingGateway')

const DAY_MS = 24 * 60 * 60 * 1000
const BILLABLE_STATUSES = ['TRIAL', 'ACTIVE', 'OVERDUE', 'BLOCKED']
const OPEN_INTENT_STATUSES = ['PENDING', 'PAID']

function addDays(date, days) {
  const next = new Date(date)
  next.setDate(next.getDate() + days)
  return next
}

function startOfDay(date) {
  const next = new Date(date)
  next.setHours(0, 0, 0, 0)
  return next
}

function endOfDay(date) {
  const next = startOfDay(date)
  next.setDate(next.getDate() + 1)
  return next
}

function toValidDate(value) {
  if (!value) return null
  const date = value instanceof Date ? value : new Date(value)
  return Number.isNaN(date.getTime()) ? null : date
}

function resolveSubscriptionDueAt(subscription, user) {
  return toValidDate(subscription?.nextDueAt)
    || toValidDate(user?.billingNextDueAt)
    || toValidDate(subscription?.graceEndsAt)
    || toValidDate(user?.billingGraceEndsAt)
}

function resolveSubscriptionAmount(subscription, user) {
  return toNumber(subscription?.amount) ?? toNumber(user?.billingAmount)
}

function buildAutomaticBillingQuery(now, lookAheadDays, limit) {
  const windowEnd = addDays(now, lookAheadDays)

  return {
    where: {
      status: { in: BILLABLE_STATUSES },
      clinic: { status: { not: 'ARCHIVED' } },
      OR: [
        { nextDueAt: { lte: windowEnd } },
        { nextDueAt: null, graceEndsAt: { lte: windowEnd } },
      ],
    },
    include: {
      clinic: {
        include: {
          ownerUser: {
            include: {
              ownedClinic: { include: { subscription: true } },
            },
          },
        },
      },
    },
    orderBy: [
      { nextDueAt: 'asc' },
      { updatedAt: 'asc' },
    ],
    take: limit,
  }
}

async function findExistingBillingCycleIntent({ prisma, clinicId, dueAt }) {
  if (!prisma?.billingGatewayIntent || !clinicId || !dueAt) return null

  return prisma.billingGatewayIntent.findFirst({
    where: {
      clinicId,
      status: { in: OPEN_INTENT_STATUSES },
      dueAt: {
        gte: startOfDay(dueAt),
        lt: endOfDay(dueAt),
      },
    },
    orderBy: { createdAt: 'desc' },
  })
}

async function expireStaleBillingGatewayIntents({ prisma, now, limit = 100 }) {
  if (!prisma?.billingGatewayIntent) return 0

  const stale = await prisma.billingGatewayIntent.findMany({
    where: {
      status: 'PENDING',
      expiresAt: { lt: now },
    },
    take: limit,
    orderBy: { expiresAt: 'asc' },
  })

  if (stale.length === 0) return 0

  const ids = stale.map(intent => intent.id)
  await prisma.billingGatewayIntent.updateMany({
    where: { id: { in: ids } },
    data: { status: 'EXPIRED' },
  })

  if (prisma.billingGatewayEvent) {
    await Promise.all(stale.map(intent => prisma.billingGatewayEvent.create({
      data: {
        intentId: intent.id,
        clinicId: intent.clinicId,
        reference: intent.reference,
        provider: intent.provider,
        eventType: 'INTENT_EXPIRED_AUTOMATICALLY',
        status: 'EXPIRED',
        payload: {
          source: 'automatic_subscription_billing',
          expiredAt: now.toISOString(),
        },
      },
    })))
  }

  return stale.length
}

async function createAutomaticBillingIntent({ prisma, subscription, method, now }) {
  const user = subscription?.clinic?.ownerUser
  const clinicId = subscription?.clinicId || subscription?.clinic?.id || user?.ownedClinic?.id || null
  const amount = resolveSubscriptionAmount(subscription, user)
  const dueAt = resolveSubscriptionDueAt(subscription, user)

  if (!user || !clinicId) {
    return { status: 'skipped', reason: 'missing_owner_or_clinic', clinicId }
  }

  if (!amount || amount <= 0) {
    return { status: 'skipped', reason: 'missing_amount', clinicId }
  }

  if (!dueAt) {
    return { status: 'skipped', reason: 'missing_due_date', clinicId }
  }

  const existingIntent = await findExistingBillingCycleIntent({ prisma, clinicId, dueAt })
  if (existingIntent) {
    return {
      status: 'skipped',
      reason: 'existing_cycle_intent',
      clinicId,
      reference: existingIntent.reference,
    }
  }

  const intent = await createGatewayIntentForSubscription({
    prisma,
    user,
    clinicId,
    amount,
    dueAt,
    method,
    source: 'automatic',
  })

  if (prisma.auditLog) {
    await prisma.auditLog.create({
      data: {
        clinicId,
        actorEmail: 'billing-automation',
        actorRole: 'SYSTEM',
        action: 'BILLING_GATEWAY_INTENT_CREATED',
        entityType: 'ClinicSubscription',
        entityId: intent.reference,
        metadata: {
          source: 'automatic_subscription_billing',
          generatedAt: now.toISOString(),
          intent,
        },
      },
    })
  }

  return {
    status: 'created',
    clinicId,
    reference: intent.reference,
    intent,
  }
}

async function runAutomaticBillingCycle({ prisma, now = new Date(), env = process.env, logger = console } = {}) {
  if (!prisma) throw new Error('Prisma nao informado para automacao de cobranca')

  const config = getGatewayAutomationSnapshot(env)
  if (!config.enabled) {
    return {
      ok: true,
      enabled: false,
      created: 0,
      skipped: 0,
      expired: 0,
      scanned: 0,
      results: [],
    }
  }

  const expired = await expireStaleBillingGatewayIntents({ prisma, now })
  const limit = Math.max(1, Math.min(Number(env.BILLING_AUTO_BATCH_LIMIT || 50), 200))
  const query = buildAutomaticBillingQuery(now, config.lookAheadDays, limit)
  const subscriptions = await prisma.clinicSubscription.findMany(query)
  const results = []

  for (const subscription of subscriptions) {
    try {
      results.push(await createAutomaticBillingIntent({
        prisma,
        subscription,
        method: config.method,
        now,
      }))
    } catch (error) {
      logger?.error?.('[billing] automatic charge failed', {
        subscriptionId: subscription?.id,
        clinicId: subscription?.clinicId,
        error: error?.message || error,
      })
      results.push({
        status: 'failed',
        reason: error?.message || 'automatic_billing_failed',
        clinicId: subscription?.clinicId || null,
      })
    }
  }

  return {
    ok: results.every(result => result.status !== 'failed'),
    enabled: true,
    method: config.method,
    lookAheadDays: config.lookAheadDays,
    created: results.filter(result => result.status === 'created').length,
    skipped: results.filter(result => result.status === 'skipped').length,
    failed: results.filter(result => result.status === 'failed').length,
    expired,
    scanned: subscriptions.length,
    results,
  }
}

function startAutomaticBillingJob({ prisma, env = process.env, logger = console } = {}) {
  const config = getGatewayAutomationSnapshot(env)
  const initialDelayMs = Number(env.BILLING_AUTO_CHARGE_INITIAL_DELAY_MS || 30000)
  let running = false

  async function run() {
    if (running) return null
    running = true

    try {
      const summary = await runAutomaticBillingCycle({ prisma, env, logger })
      if (summary.enabled && (summary.created > 0 || summary.expired > 0 || summary.failed > 0)) {
        logger?.info?.('[billing] automatic charge cycle finished', summary)
      }
      return summary
    } finally {
      running = false
    }
  }

  if (!config.enabled) {
    logger?.info?.('[billing] automatic charge job disabled')
    return { config, run, stop: () => undefined }
  }

  const safeInitialDelay = Number.isFinite(initialDelayMs) ? Math.max(1000, initialDelayMs) : 30000
  const timeout = setTimeout(() => {
    run().catch(error => logger?.error?.('[billing] automatic charge cycle failed', error))
  }, safeInitialDelay)
  const interval = setInterval(() => {
    run().catch(error => logger?.error?.('[billing] automatic charge cycle failed', error))
  }, config.intervalMinutes * 60 * 1000)

  timeout.unref?.()
  interval.unref?.()

  logger?.info?.('[billing] automatic charge job enabled', config)

  return {
    config,
    run,
    stop() {
      clearTimeout(timeout)
      clearInterval(interval)
    },
  }
}

module.exports = {
  buildAutomaticBillingQuery,
  createAutomaticBillingIntent,
  expireStaleBillingGatewayIntents,
  findExistingBillingCycleIntent,
  runAutomaticBillingCycle,
  startAutomaticBillingJob,
}