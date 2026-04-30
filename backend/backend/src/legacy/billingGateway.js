const crypto = require('crypto')
const { z } = require('zod')

const gatewayIntentStatuses = ['PENDING', 'PAID', 'FAILED', 'CANCELLED', 'EXPIRED']
const gatewayPaymentMethods = ['PIX', 'CREDIT_CARD', 'BANK_TRANSFER']

const gatewayIntentSchema = z.object({
  method: z.enum(gatewayPaymentMethods).default('PIX').optional(),
  amount: z.number().min(0.01).optional(),
  dueAt: z.string().optional(),
})

const gatewayWebhookSchema = z.object({
  reference: z.string().trim().min(4).max(120),
  status: z.enum(gatewayIntentStatuses),
  amount: z.number().min(0).optional(),
  paidAt: z.string().optional(),
  nextDueAt: z.string().optional(),
  provider: z.string().trim().max(80).optional(),
  providerPaymentId: z.string().trim().max(160).optional(),
  metadata: z.record(z.unknown()).optional(),
})

function toNumber(value) {
  if (value === null || value === undefined || value === '') return null
  const parsed = Number(value)
  return Number.isFinite(parsed) ? parsed : null
}

function toIsoString(value) {
  if (!value) return null
  const date = value instanceof Date ? value : new Date(value)
  return Number.isNaN(date.getTime()) ? null : date.toISOString()
}

function createGatewayReference(clinicId) {
  const stamp = Date.now().toString(36).toUpperCase()
  const random = crypto.randomBytes(3).toString('hex').toUpperCase()
  return 'LAPPUI-' + clinicId + '-' + stamp + '-' + random
}

function getGatewayProviderName(env = process.env) {
  return env.BILLING_GATEWAY_PROVIDER || 'MANUAL_READY'
}

function normalizeGatewayStatus(status, fallback = 'PENDING') {
  const value = String(status || fallback || 'PENDING').toUpperCase()
  return gatewayIntentStatuses.includes(value) ? value : fallback
}

function normalizeGatewayMethod(method, fallback = 'PIX') {
  const value = String(method || fallback || 'PIX').toUpperCase()
  return gatewayPaymentMethods.includes(value) ? value : fallback
}

function gatewayPersistenceAvailable(prisma) {
  return Boolean(prisma?.billingGatewayIntent && prisma?.billingGatewayEvent)
}

function buildBillingGatewayReadiness({ env = process.env, persistence = 'database' } = {}) {
  const provider = getGatewayProviderName(env)
  const hasRealProvider = provider !== 'MANUAL_READY'
  const webhookConfigured = Boolean(env.BILLING_WEBHOOK_SECRET)
  const automaticBillingEnabled = env.BILLING_AUTOMATION_ENABLED === 'true'
  const missing = []

  if (!hasRealProvider) missing.push('BILLING_GATEWAY_PROVIDER')
  if (!webhookConfigured) missing.push('BILLING_WEBHOOK_SECRET')
  if (persistence !== 'database') missing.push('billing_gateway_intents/billing_gateway_events')

  const readyForLiveProvider = hasRealProvider && webhookConfigured && persistence === 'database'
  const status = readyForLiveProvider ? 'READY' : (hasRealProvider || webhookConfigured ? 'PARTIAL' : 'SIMULATION')

  return {
    status,
    provider,
    mode: readyForLiveProvider ? 'live_provider_ready' : 'provider_agnostic',
    persistence,
    configured: readyForLiveProvider,
    readyForLiveProvider,
    webhookConfigured,
    automaticBillingEnabled,
    supportedMethods: gatewayPaymentMethods.slice(),
    missing,
    message: readyForLiveProvider
      ? 'Gateway financeiro pronto para operar com provedor real, webhook assinado e persistencia dedicada.'
      : 'Gateway em modo seguro de preparacao: gera intencoes rastreaveis e aguarda credenciais do provedor real.',
  }
}

function isMissingGatewayPersistenceError(error) {
  const code = error?.code
  const message = String(error?.message || '').toLowerCase()

  return code === 'P2021'
    || code === 'P2022'
    || message.includes('billing_gateway_intents')
    || message.includes('billing_gateway_events')
}

function buildIntentPayload({ clinicId, amount, dueAt, method, reference }) {
  const due = dueAt instanceof Date ? dueAt : new Date(dueAt)
  const paymentMethod = normalizeGatewayMethod(method)

  return {
    provider: getGatewayProviderName(),
    reference,
    clinicId,
    amount: Number(Number(amount).toFixed(2)),
    currency: 'BRL',
    status: 'PENDING',
    paymentMethod,
    dueAt: due.toISOString(),
    expiresAt: new Date(due.getTime() + 24 * 60 * 60 * 1000).toISOString(),
    checkoutUrl: null,
    pixCopyPaste: paymentMethod === 'PIX'
      ? 'COBRANCA_PENDENTE_GATEWAY_REAL_' + reference
      : null,
    message: 'Intencao de cobranca criada. Conecte um provedor real para gerar Pix dinamico, cartao ou recorrencia.',
  }
}

function serializeIntentFromAuditLog(log) {
  if (!log?.metadata || typeof log.metadata !== 'object') return null
  const intent = log.metadata.intent && typeof log.metadata.intent === 'object'
    ? log.metadata.intent
    : log.metadata

  return {
    provider: intent.provider || getGatewayProviderName(),
    reference: intent.reference || log.entityId || null,
    clinicId: intent.clinicId ?? log.clinicId ?? null,
    amount: toNumber(intent.amount),
    currency: intent.currency || 'BRL',
    status: normalizeGatewayStatus(intent.status),
    paymentMethod: normalizeGatewayMethod(intent.paymentMethod || intent.method),
    dueAt: intent.dueAt || null,
    expiresAt: intent.expiresAt || null,
    checkoutUrl: intent.checkoutUrl || null,
    pixCopyPaste: intent.pixCopyPaste || null,
    message: intent.message || null,
    createdAt: toIsoString(log.createdAt),
    paidAt: intent.paidAt || null,
    providerPaymentId: intent.providerPaymentId || null,
  }
}

function serializeIntentRecord(record) {
  if (!record) return null

  const payload = record.payload && typeof record.payload === 'object'
    ? record.payload
    : {}

  return {
    id: record.id,
    provider: record.provider || getGatewayProviderName(),
    reference: record.reference || null,
    clinicId: record.clinicId ?? null,
    amount: toNumber(record.amount),
    currency: record.currency || 'BRL',
    status: normalizeGatewayStatus(record.status),
    paymentMethod: normalizeGatewayMethod(record.method),
    dueAt: toIsoString(record.dueAt),
    expiresAt: toIsoString(record.expiresAt),
    checkoutUrl: record.checkoutUrl || null,
    pixCopyPaste: record.pixCopyPaste || null,
    message: payload.message || null,
    createdAt: toIsoString(record.createdAt),
    paidAt: toIsoString(record.paidAt),
    providerPaymentId: record.providerPaymentId || null,
    eventCount: Array.isArray(record.events) ? record.events.length : undefined,
  }
}

async function writeGatewayEvent({ prisma, intentId, clinicId, reference, provider, eventType, status, payload }) {
  if (!prisma?.billingGatewayEvent) return null

  try {
    return await prisma.billingGatewayEvent.create({
      data: {
        intentId: intentId || null,
        clinicId: clinicId || null,
        reference: reference || null,
        provider: provider || getGatewayProviderName(),
        eventType,
        status: status ? normalizeGatewayStatus(status) : null,
        payload: payload || {},
      },
    })
  } catch (error) {
    if (isMissingGatewayPersistenceError(error)) return null
    throw error
  }
}

async function createIntentRecord({ prisma, user, clinicId, intent }) {
  if (!prisma?.billingGatewayIntent) return null

  try {
    const record = await prisma.billingGatewayIntent.create({
      data: {
        clinicId,
        userId: user.id,
        reference: intent.reference,
        provider: intent.provider || getGatewayProviderName(),
        providerPaymentId: intent.providerPaymentId || null,
        method: normalizeGatewayMethod(intent.paymentMethod),
        status: normalizeGatewayStatus(intent.status),
        amount: intent.amount,
        currency: intent.currency || 'BRL',
        dueAt: intent.dueAt ? new Date(intent.dueAt) : null,
        expiresAt: intent.expiresAt ? new Date(intent.expiresAt) : null,
        checkoutUrl: intent.checkoutUrl || null,
        pixCopyPaste: intent.pixCopyPaste || null,
        payload: intent,
      },
      include: { events: true },
    })

    await writeGatewayEvent({
      prisma,
      intentId: record.id,
      clinicId,
      reference: intent.reference,
      provider: intent.provider,
      eventType: 'INTENT_CREATED',
      status: intent.status,
      payload: intent,
    })

    const saved = await prisma.billingGatewayIntent.findUnique({
      where: { id: record.id },
      include: { events: true },
    })

    return serializeIntentRecord(saved || record)
  } catch (error) {
    if (isMissingGatewayPersistenceError(error)) return null
    throw error
  }
}

async function updateIntentRecord({ prisma, reference, clinicId, provider, providerPaymentId, status, amount, paidAt, payload, eventType }) {
  if (!prisma?.billingGatewayIntent) {
    await writeGatewayEvent({ prisma, clinicId, reference, provider, eventType, status, payload })
    return null
  }

  try {
    const current = await prisma.billingGatewayIntent.findUnique({ where: { reference } })

    if (!current) {
      await writeGatewayEvent({ prisma, clinicId, reference, provider, eventType, status, payload })
      return null
    }

    const updateData = {
      status: normalizeGatewayStatus(status),
      provider: provider || current.provider || getGatewayProviderName(),
      providerPaymentId: providerPaymentId || current.providerPaymentId || null,
      payload: payload || current.payload || {},
    }

    const numericAmount = toNumber(amount)
    if (numericAmount !== null) updateData.amount = numericAmount
    if (paidAt) updateData.paidAt = paidAt

    const updated = await prisma.billingGatewayIntent.update({
      where: { id: current.id },
      data: updateData,
      include: { events: true },
    })

    await writeGatewayEvent({
      prisma,
      intentId: updated.id,
      clinicId: updated.clinicId,
      reference: updated.reference,
      provider: updated.provider,
      eventType,
      status: updated.status,
      payload,
    })

    const saved = await prisma.billingGatewayIntent.findUnique({
      where: { id: updated.id },
      include: { events: true },
    })

    return serializeIntentRecord(saved || updated)
  } catch (error) {
    if (isMissingGatewayPersistenceError(error)) return null
    throw error
  }
}

async function getLatestGatewayIntent({ prisma, clinicId }) {
  if (!clinicId) return null

  if (prisma?.billingGatewayIntent) {
    try {
      const record = await prisma.billingGatewayIntent.findFirst({
        where: { clinicId },
        include: { events: true },
        orderBy: { createdAt: 'desc' },
      })

      const serialized = serializeIntentRecord(record)
      if (serialized) return serialized
    } catch (error) {
      if (!isMissingGatewayPersistenceError(error)) throw error
    }
  }

  const log = await prisma.auditLog.findFirst({
    where: {
      clinicId,
      action: { in: ['BILLING_GATEWAY_INTENT_CREATED', 'BILLING_GATEWAY_PAYMENT_CONFIRMED', 'BILLING_GATEWAY_PAYMENT_FAILED'] },
    },
    orderBy: { createdAt: 'desc' },
  })

  return serializeIntentFromAuditLog(log)
}

async function updateSubscriptionReference({ prisma, user, clinicId, amount, dueAt, reference }) {
  await prisma.$transaction([
    prisma.user.update({
      where: { id: user.id },
      data: {
        billingAmount: amount,
        billingNextDueAt: dueAt,
        billingReference: reference,
      },
    }),
    prisma.clinic.update({
      where: { id: clinicId },
      data: {
        subscription: {
          upsert: {
            create: {
              status: user.billingStatus || 'TRIAL',
              amount,
              graceEndsAt: user.billingGraceEndsAt || null,
              nextDueAt: dueAt,
              reference,
              notes: user.billingNotes || null,
            },
            update: {
              amount,
              nextDueAt: dueAt,
              reference,
            },
          },
        },
      },
    }),
  ])
}

async function createGatewayIntentForSubscription({
  prisma,
  user,
  clinicId,
  amount,
  dueAt,
  method = 'PIX',
  reference,
  source = 'manual',
}) {
  if (!user?.id) throw new Error('Usuario da assinatura nao informado')
  if (!clinicId) throw new Error('Clínica da assinatura não informada')

  const billingReference = reference || createGatewayReference(clinicId)
  const intent = buildIntentPayload({ clinicId, amount, dueAt, method, reference: billingReference })

  if (source === 'automatic') {
    intent.message = 'Cobrança automática de assinatura gerada pelo LAppui. O pagamento será confirmado por webhook quando o provedor retornar sucesso.'
  }

  intent.source = source

  await updateSubscriptionReference({ prisma, user, clinicId, amount, dueAt, reference: billingReference })

  const persistedIntent = await createIntentRecord({ prisma, user, clinicId, intent })
  return persistedIntent || intent
}

function getGatewayAutomationSnapshot(env = process.env) {
  const enabledValue = String(env.BILLING_AUTO_CHARGE_ENABLED ?? 'true').trim().toLowerCase()
  const enabled = !['false', '0', 'off', 'no'].includes(enabledValue)
  const lookAheadDays = Number(env.BILLING_AUTO_LOOKAHEAD_DAYS || 3)
  const intervalMinutes = Number(env.BILLING_AUTO_CHARGE_INTERVAL_MINUTES || 60)
  const method = normalizeGatewayMethod(env.BILLING_AUTO_METHOD || 'PIX')

  return {
    enabled,
    method,
    lookAheadDays: Number.isFinite(lookAheadDays) ? Math.max(0, Math.min(lookAheadDays, 30)) : 3,
    intervalMinutes: Number.isFinite(intervalMinutes) ? Math.max(5, Math.min(intervalMinutes, 1440)) : 60,
    message: enabled
      ? 'Cobrança automática ativa: o servidor prepara intenções de pagamento para assinaturas próximas do vencimento.'
      : 'Cobrança automática pausada por configuração de ambiente.',
  }
}

async function applyGatewayPayment({
  prisma,
  user,
  clinicId,
  amount,
  paidAt,
  nextDueAt,
  reference,
  addDays,
  ensureClinicAggregate,
}) {
  const paidDate = paidAt || new Date()
  const nextDue = nextDueAt || addDays(paidDate, 30)
  const nextAmount = amount ?? user.ownedClinic?.subscription?.amount ?? user.billingAmount ?? null

  await prisma.$transaction([
    prisma.user.update({
      where: { id: user.id },
      data: {
        billingStatus: 'ACTIVE',
        billingAmount: nextAmount,
        billingLastPaidAt: paidDate,
        billingNextDueAt: nextDue,
        billingGraceEndsAt: null,
        billingReference: reference,
      },
    }),
    prisma.clinic.update({
      where: { id: clinicId },
      data: {
        status: 'ACTIVE',
        subscription: {
          upsert: {
            create: {
              status: 'ACTIVE',
              amount: nextAmount,
              lastPaidAt: paidDate,
              nextDueAt: nextDue,
              graceEndsAt: null,
              reference,
              notes: user.billingNotes || null,
            },
            update: {
              status: 'ACTIVE',
              amount: nextAmount,
              lastPaidAt: paidDate,
              nextDueAt: nextDue,
              graceEndsAt: null,
              reference,
            },
          },
        },
      },
    }),
  ])

  return ensureClinicAggregate(user.id)
}

function compareSecret(received, expected) {
  const left = Buffer.from(String(received || ''))
  const right = Buffer.from(String(expected || ''))
  return left.length === right.length && crypto.timingSafeEqual(left, right)
}

async function resolveUserByGatewayReference({ prisma, reference }) {
  if (prisma?.billingGatewayIntent) {
    try {
      const record = await prisma.billingGatewayIntent.findUnique({
        where: { reference },
        include: {
          user: {
            include: {
              ownedClinic: { include: { subscription: true } },
            },
          },
          clinic: true,
        },
      })

      if (record?.user?.ownedClinic) {
        return {
          user: record.user,
          clinicId: record.clinicId,
          intentRecord: record,
        }
      }
    } catch (error) {
      if (!isMissingGatewayPersistenceError(error)) throw error
    }
  }

  const subscription = await prisma.clinicSubscription.findFirst({
    where: { reference },
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
  })

  if (subscription?.clinic?.ownerUser) {
    return {
      user: subscription.clinic.ownerUser,
      clinicId: subscription.clinic.id,
    }
  }

  const user = await prisma.user.findFirst({
    where: { billingReference: reference },
    include: {
      ownedClinic: { include: { subscription: true } },
    },
  })

  if (!user?.ownedClinic) return null

  return {
    user,
    clinicId: user.ownedClinic.id,
  }
}

function registerBillingGatewayRoutes({
  app,
  prisma,
  authMiddleware,
  requireSupportBillingControl,
  handle,
  parseDateOnly,
  addDays,
  ensureClinicAggregate,
  getBillingSnapshot,
  createAuditLogFromRequest,
  httpError,
}) {
  const deps = {
    app,
    prisma,
    authMiddleware,
    requireSupportBillingControl,
    handle,
    parseDateOnly,
    addDays,
    ensureClinicAggregate,
    getBillingSnapshot,
    createAuditLogFromRequest,
    httpError,
  }

  for (const [key, value] of Object.entries(deps)) {
    if (!value) throw new Error('registerBillingGatewayRoutes requer ' + key)
  }

  app.get('/billing/gateway/status', authMiddleware, handle(async (req, res) => {
    const clinicId = req.currentUser?.ownedClinic?.id || null
    const latestIntent = await getLatestGatewayIntent({ prisma, clinicId })

    const persistence = gatewayPersistenceAvailable(prisma) ? 'database' : 'audit_log_fallback'
    const readiness = buildBillingGatewayReadiness({ env: process.env, persistence })

    res.json({
      provider: readiness.provider,
      mode: readiness.mode,
      persistence,
      configured: readiness.configured,
      webhookConfigured: readiness.webhookConfigured,
      readiness,
      supportedMethods: readiness.supportedMethods,
      automation: getGatewayAutomationSnapshot(),
      latestIntent,
      message: readiness.message,
    })
  }))

  app.post('/billing/gateway/intents', authMiddleware, handle(async (req, res) => {
    const data = gatewayIntentSchema.parse(req.body || {})
    const user = req.currentUser
    const clinicId = user?.ownedClinic?.id

    if (!clinicId) throw httpError(409, 'Clínica não encontrada para gerar cobrança')

    const subscription = user.ownedClinic?.subscription
    const amount = data.amount ?? toNumber(subscription?.amount) ?? toNumber(user.billingAmount)

    if (!amount || amount <= 0) {
      throw httpError(409, 'Defina o valor da assinatura antes de gerar uma cobranca')
    }

    const dueAt = data.dueAt
      ? parseDateOnly(data.dueAt, 'dueAt')
      : (subscription?.nextDueAt || user.billingNextDueAt || addDays(new Date(), 1))
    const method = data.method || 'PIX'
    const responseIntent = await createGatewayIntentForSubscription({
      prisma,
      user,
      clinicId,
      amount,
      dueAt,
      method,
      source: 'manual',
    })

    await createAuditLogFromRequest(req, {
      clinicId,
      action: 'BILLING_GATEWAY_INTENT_CREATED',
      entityType: 'ClinicSubscription',
      entityId: responseIntent.reference,
      metadata: { intent: responseIntent },
    })

    const updatedUser = await ensureClinicAggregate(user.id)

    res.status(201).json({
      intent: responseIntent,
      billing: getBillingSnapshot(updatedUser),
    })
  }))

  app.post('/billing/gateway/intents/:reference/simulate-paid', authMiddleware, requireSupportBillingControl, handle(async (req, res) => {
    const reference = String(req.params.reference || '').trim()
    if (!reference) throw httpError(400, 'Referencia da cobranca nao informada')

    const payload = gatewayWebhookSchema.partial().parse(req.body || {})
    const user = req.currentUser
    const clinicId = user?.ownedClinic?.id
    if (!clinicId) throw httpError(409, 'Clínica não encontrada para confirmar cobrança')

    const paidAt = payload.paidAt ? new Date(payload.paidAt) : new Date()
    const nextDueAt = payload.nextDueAt ? parseDateOnly(payload.nextDueAt, 'nextDueAt') : null
    const amount = payload.amount ?? toNumber(user.ownedClinic?.subscription?.amount) ?? toNumber(user.billingAmount)

    const updatedUser = await applyGatewayPayment({
      prisma,
      user,
      clinicId,
      amount,
      paidAt,
      nextDueAt,
      reference,
      addDays,
      ensureClinicAggregate,
    })

    const intent = buildIntentPayload({
      clinicId,
      amount,
      dueAt: nextDueAt || updatedUser.ownedClinic?.subscription?.nextDueAt || addDays(paidAt, 30),
      method: 'PIX',
      reference,
    })
    intent.status = 'PAID'
    intent.paidAt = paidAt.toISOString()
    intent.providerPaymentId = payload.providerPaymentId || null

    const persistedIntent = await updateIntentRecord({
      prisma,
      reference,
      clinicId,
      provider: payload.provider,
      providerPaymentId: payload.providerPaymentId,
      status: 'PAID',
      amount,
      paidAt,
      payload: intent,
      eventType: 'PAYMENT_SIMULATED',
    })
    const responseIntent = persistedIntent || intent

    await createAuditLogFromRequest(req, {
      clinicId,
      action: 'BILLING_GATEWAY_PAYMENT_CONFIRMED',
      entityType: 'ClinicSubscription',
      entityId: reference,
      metadata: {
        intent: responseIntent,
        source: 'support_simulation',
      },
    })

    res.json({
      intent: responseIntent,
      billing: getBillingSnapshot(updatedUser),
    })
  }))

  app.post('/webhooks/billing', handle(async (req, res) => {
    const secret = process.env.BILLING_WEBHOOK_SECRET
    if (!secret) {
      return res.status(503).json({ error: 'Webhook financeiro ainda nao configurado no ambiente' })
    }

    const receivedSecret = req.headers['x-lappui-billing-secret']
    if (!compareSecret(receivedSecret, secret)) {
      return res.status(401).json({ error: 'Assinatura do webhook financeiro invalida' })
    }

    const event = gatewayWebhookSchema.parse(req.body || {})
    const resolved = await resolveUserByGatewayReference({ prisma, reference: event.reference })

    if (!resolved) throw httpError(404, 'Referencia de cobranca nao encontrada')

    const paidAt = event.paidAt ? new Date(event.paidAt) : new Date()
    const nextDueAt = event.nextDueAt ? parseDateOnly(event.nextDueAt, 'nextDueAt') : null
    let updatedUser = resolved.user
    const eventAmount = event.amount ?? toNumber(resolved.intentRecord?.amount) ?? toNumber(resolved.user.ownedClinic?.subscription?.amount) ?? toNumber(resolved.user.billingAmount) ?? 0
    let intent = buildIntentPayload({
      clinicId: resolved.clinicId,
      amount: eventAmount,
      dueAt: nextDueAt || resolved.user.ownedClinic?.subscription?.nextDueAt || addDays(paidAt, 30),
      method: resolved.intentRecord?.method || 'PIX',
      reference: event.reference,
    })
    intent.status = event.status
    intent.provider = event.provider || intent.provider
    intent.providerPaymentId = event.providerPaymentId || null

    if (event.status === 'PAID') {
      updatedUser = await applyGatewayPayment({
        prisma,
        user: resolved.user,
        clinicId: resolved.clinicId,
        amount: event.amount,
        paidAt,
        nextDueAt,
        reference: event.reference,
        addDays,
        ensureClinicAggregate,
      })
      intent.status = 'PAID'
      intent.paidAt = paidAt.toISOString()
    }

    const persistedIntent = await updateIntentRecord({
      prisma,
      reference: event.reference,
      clinicId: resolved.clinicId,
      provider: event.provider,
      providerPaymentId: event.providerPaymentId,
      status: event.status,
      amount: event.amount,
      paidAt: event.status === 'PAID' ? paidAt : null,
      payload: {
        intent,
        event,
      },
      eventType: 'WEBHOOK_' + event.status,
    })
    intent = persistedIntent || intent

    await prisma.auditLog.create({
      data: {
        clinicId: resolved.clinicId,
        actorEmail: event.provider || 'billing-webhook',
        actorRole: 'GATEWAY',
        action: event.status === 'PAID' ? 'BILLING_GATEWAY_PAYMENT_CONFIRMED' : 'BILLING_GATEWAY_WEBHOOK_RECEIVED',
        entityType: 'ClinicSubscription',
        entityId: event.reference,
        metadata: {
          intent,
          event,
        },
      },
    })

    res.json({
      ok: true,
      intent,
      billing: getBillingSnapshot(updatedUser),
    })
  }))
}

module.exports = {
  applyGatewayPayment,
  buildBillingGatewayReadiness,
  buildIntentPayload,
  createGatewayIntentForSubscription,
  createGatewayReference,
  getGatewayAutomationSnapshot,
  getGatewayProviderName,
  getLatestGatewayIntent,
  registerBillingGatewayRoutes,
  toNumber,
}
