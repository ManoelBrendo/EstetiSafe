const crypto = require('crypto')
const DEFAULT_GRAPH_API_VERSION = process.env.WHATSAPP_GRAPH_API_VERSION || 'v21.0'
const DEFAULT_API_BASE_URL = 'https://graph.facebook.com'

class WhatsAppProviderError extends Error {
  constructor(message, details = {}) {
    super(message)
    this.name = 'WhatsAppProviderError'
    this.status = details.status || null
    this.code = details.code || null
    this.response = details.response || null
  }
}

function normalizePhoneNumber(value) {
  return String(value || '').replace(/\D/g, '')
}

function assertPhoneNumberId(phoneNumberId) {
  const normalized = String(phoneNumberId || '').trim()
  if (!/^\d{6,32}$/.test(normalized)) {
    throw new WhatsAppProviderError('phoneNumberId invalido para WhatsApp Business')
  }
  return normalized
}

function toTemplateParameter(value) {
  if (value && typeof value === 'object' && value.type) {
    return value
  }

  return {
    type: 'text',
    text: value === null || value === undefined ? '' : String(value),
  }
}

function buildTemplateComponents({ headerParams = [], bodyParams = [], buttonParams = [] } = {}) {
  const components = []

  if (headerParams.length > 0) {
    components.push({
      type: 'header',
      parameters: headerParams.map(toTemplateParameter),
    })
  }

  if (bodyParams.length > 0) {
    components.push({
      type: 'body',
      parameters: bodyParams.map(toTemplateParameter),
    })
  }

  for (const button of buttonParams) {
    components.push({
      type: 'button',
      sub_type: button.subType || button.sub_type || 'url',
      index: String(button.index || 0),
      parameters: (button.parameters || []).map(toTemplateParameter),
    })
  }

  return components
}

function getProviderMessageId(providerResponse) {
  return providerResponse?.messages?.[0]?.id || null
}

class WhatsAppProvider {
  constructor({
    accessToken,
    phoneNumberId,
    graphApiVersion = DEFAULT_GRAPH_API_VERSION,
    apiBaseUrl = DEFAULT_API_BASE_URL,
    fetchImpl = globalThis.fetch,
  }) {
    if (!accessToken || typeof accessToken !== 'string') {
      throw new WhatsAppProviderError('Bearer token do WhatsApp nao informado')
    }

    if (typeof fetchImpl !== 'function') {
      throw new WhatsAppProviderError('fetchImpl nao informado para WhatsAppProvider')
    }

    this.accessToken = accessToken
    this.phoneNumberId = assertPhoneNumberId(phoneNumberId)
    this.graphApiVersion = graphApiVersion
    this.apiBaseUrl = apiBaseUrl.replace(/\/$/, '')
    this.fetchImpl = fetchImpl
  }

  async sendTemplateMessage({
    to,
    templateName,
    languageCode = 'pt_BR',
    headerParams = [],
    bodyParams = [],
    buttonParams = [],
  }) {
    const recipient = normalizePhoneNumber(to)

    if (!recipient) {
      throw new WhatsAppProviderError('Numero de destino invalido', { code: 'INVALID_RECIPIENT' })
    }

    if (!templateName || typeof templateName !== 'string') {
      throw new WhatsAppProviderError('Nome do template WhatsApp nao informado', { code: 'INVALID_TEMPLATE' })
    }

    const url = `${this.apiBaseUrl}/${this.graphApiVersion}/${this.phoneNumberId}/messages`
    const components = buildTemplateComponents({ headerParams, bodyParams, buttonParams })
    const payload = {
      messaging_product: 'whatsapp',
      to: recipient,
      type: 'template',
      template: {
        name: templateName,
        language: { code: languageCode },
        ...(components.length > 0 ? { components } : {}),
      },
    }

    const response = await this.fetchImpl(url, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${this.accessToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(payload),
    })

    const responseBody = await response.json().catch(() => ({}))

    if (!response.ok) {
      const metaError = responseBody?.error || {}
      throw new WhatsAppProviderError(metaError.message || 'Falha ao enviar mensagem WhatsApp', {
        status: response.status,
        code: metaError.code || metaError.type || 'WHATSAPP_SEND_FAILED',
        response: responseBody,
      })
    }

    return responseBody
  }
}

function mapWhatsAppStatus(status) {
  const normalized = String(status || '').toLowerCase()
  const statusMap = {
    sent: 'SENT',
    delivered: 'DELIVERED',
    read: 'READ',
    failed: 'FAILED',
  }

  return statusMap[normalized] || 'RECEIVED'
}

function extractWebhookEvents(payload) {
  const statuses = []
  const messages = []

  for (const entry of payload?.entry || []) {
    for (const change of entry?.changes || []) {
      const value = change?.value || {}
      const phoneNumberId = value?.metadata?.phone_number_id || null

      for (const status of value.statuses || []) {
        statuses.push({ phoneNumberId, status })
      }

      for (const message of value.messages || []) {
        messages.push({ phoneNumberId, message })
      }
    }
  }

  return { statuses, messages }
}

function normalizeReplyIntent(text) {
  const normalized = String(text || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .trim()
    .toUpperCase()

  const compact = normalized.replace(/[^A-Z]/g, '')
  const yesValues = ['SIM', 'S', 'YES', 'CONFIRMO', 'CONFIRMAR', 'CONFIRMADO']
  const noValues = ['NAO', 'N', 'NO', 'CANCELAR', 'CANCELO', 'REMARCAR']

  if (yesValues.includes(normalized) || yesValues.includes(compact)) {
    return 'YES'
  }

  if (noValues.includes(normalized) || noValues.includes(compact)) {
    return 'NO'
  }

  return null
}

function getIncomingMessageText(message) {
  if (message?.type === 'text') return message?.text?.body || ''
  if (message?.button?.text) return message.button.text
  if (message?.interactive?.button_reply?.title) return message.interactive.button_reply.title
  if (message?.interactive?.list_reply?.title) return message.interactive.list_reply.title
  return ''
}

async function findConfigForWebhook({ prisma, phoneNumberId, verifyToken }) {
  if (!prisma?.whatsappClinicConfig) return null

  if (phoneNumberId) {
    const byPhoneNumber = await prisma.whatsappClinicConfig.findFirst({
      where: {
        phoneNumberId: String(phoneNumberId),
        active: true,
      },
    })

    if (byPhoneNumber) return byPhoneNumber
  }

  if (verifyToken) {
    return prisma.whatsappClinicConfig.findFirst({
      where: {
        verifyToken: String(verifyToken),
        active: true,
      },
    })
  }

  return null
}

async function resolveAppointmentForInbound({ prisma, userId, senderPhone, contextMessageId, now = new Date() }) {
  if (contextMessageId && prisma.whatsappLog) {
    const previousLog = await prisma.whatsappLog.findFirst({
      where: {
        providerMessageId: contextMessageId,
        appointmentId: { not: null },
      },
      select: { appointmentId: true },
      orderBy: { createdAt: 'desc' },
    })

    if (previousLog?.appointmentId) {
      return prisma.appointment.findFirst({
        where: {
          id: previousLog.appointmentId,
          userId,
        },
        include: { client: true },
      })
    }
  }

  const sender = normalizePhoneNumber(senderPhone)
  if (!sender) return null

  const tomorrow = new Date(now.getTime() + 48 * 60 * 60 * 1000)
  const candidates = await prisma.appointment.findMany({
    where: {
      userId,
      status: { in: ['SCHEDULED', 'CONFIRMED'] },
      startAt: {
        gte: now,
        lte: tomorrow,
      },
    },
    include: { client: true },
    orderBy: { startAt: 'asc' },
  })

  return candidates.find(appointment => normalizePhoneNumber(appointment.client?.phone) === sender) || null
}

async function writeWhatsAppLog({ prisma, data }) {
  if (!prisma?.whatsappLog) return null
  return prisma.whatsappLog.create({ data })
}

async function handleStatusEvent({ prisma, config, event }) {
  const providerMessageId = event.status?.id || null
  const mappedStatus = mapWhatsAppStatus(event.status?.status)

  if (providerMessageId && prisma.whatsappLog) {
    await prisma.whatsappLog.updateMany({
      where: { providerMessageId },
      data: {
        status: mappedStatus,
        payload: event.status,
      },
    })
  }

  await writeWhatsAppLog({
    prisma,
    data: {
      userId: config.userId,
      configId: config.id,
      direction: 'STATUS',
      messageType: 'STATUS',
      providerMessageId,
      recipientPhone: event.status?.recipient_id || null,
      status: mappedStatus,
      payload: event.status,
      errorCode: event.status?.errors?.[0]?.code ? String(event.status.errors[0].code) : null,
      errorMessage: event.status?.errors?.[0]?.message || null,
    },
  })

  return { providerMessageId, status: mappedStatus }
}

async function handleInboundMessage({ prisma, config, event, logger = console, now = new Date() }) {
  const message = event.message
  const receivedText = getIncomingMessageText(message)
  const intent = normalizeReplyIntent(receivedText)
  const contextMessageId = message?.context?.id || null
  let appointment = null

  if (intent) {
    appointment = await resolveAppointmentForInbound({
      prisma,
      userId: config.userId,
      senderPhone: message?.from,
      contextMessageId,
      now,
    })

    if (appointment) {
      await prisma.appointment.update({
        where: { id: appointment.id },
        data: { status: intent === 'YES' ? 'CONFIRMED' : 'CANCELLED' },
      })
    } else {
      logger.warn?.('[whatsapp] inbound confirmation without appointment match', {
        userId: config.userId,
        senderPhone: message?.from,
        contextMessageId,
      })
    }
  }

  await writeWhatsAppLog({
    prisma,
    data: {
      userId: config.userId,
      configId: config.id,
      appointmentId: appointment?.id || null,
      direction: 'INBOUND',
      messageType: message?.type === 'text' ? 'TEXT' : 'WEBHOOK',
      providerMessageId: message?.id || null,
      senderPhone: message?.from || null,
      receivedText,
      status: intent === 'YES' ? 'CONFIRMED' : intent === 'NO' ? 'DECLINED' : 'RECEIVED',
      payload: message,
    },
  })

  return {
    providerMessageId: message?.id || null,
    appointmentId: appointment?.id || null,
    intent,
  }
}

async function processWhatsAppWebhook({ prisma, payload, logger = console, now = new Date() }) {
  const { statuses, messages } = extractWebhookEvents(payload)
  const processed = {
    statuses: [],
    messages: [],
    ignored: 0,
  }

  for (const event of statuses) {
    const config = await findConfigForWebhook({ prisma, phoneNumberId: event.phoneNumberId })
    if (!config) {
      processed.ignored += 1
      continue
    }

    processed.statuses.push(await handleStatusEvent({ prisma, config, event }))
  }

  for (const event of messages) {
    const config = await findConfigForWebhook({ prisma, phoneNumberId: event.phoneNumberId })
    if (!config) {
      processed.ignored += 1
      continue
    }

    processed.messages.push(await handleInboundMessage({ prisma, config, event, logger, now }))
  }

  return processed
}

function isWebhookVerificationValid(query, verifyToken) {
  return query['hub.mode'] === 'subscribe'
    && Boolean(query['hub.challenge'])
    && query['hub.verify_token'] === verifyToken
}

function buildMetaSignature(rawBody, appSecret) {
  return 'sha256=' + crypto.createHmac('sha256', appSecret).update(rawBody).digest('hex')
}

function safeCompareText(left, right) {
  const leftBuffer = Buffer.from(String(left || ''))
  const rightBuffer = Buffer.from(String(right || ''))
  return leftBuffer.length === rightBuffer.length && crypto.timingSafeEqual(leftBuffer, rightBuffer)
}

function isMetaSignatureValid({ signature, rawBody, appSecret }) {
  if (!appSecret) return true
  if (!signature || !rawBody) return false

  const expected = buildMetaSignature(rawBody, appSecret)
  return safeCompareText(signature, expected)
}

function isMissingWhatsAppPersistenceError(error) {
  const code = error?.code
  const message = String(error?.message || '').toLowerCase()

  return code === 'P2021'
    || code === 'P2022'
    || message.includes('whatsapp_clinic_configs')
    || message.includes('whatsapp_logs')
}

async function countWhatsAppRecords(model, args = {}) {
  if (!model?.count) return 0

  try {
    return await model.count(args)
  } catch (error) {
    if (isMissingWhatsAppPersistenceError(error)) return 0
    throw error
  }
}

function buildWhatsAppReadiness({
  env = process.env,
  activeConfigCount = 0,
  outboundLast24h = 0,
  inboundLast24h = 0,
  failedLast24h = 0,
  graphApiVersion = DEFAULT_GRAPH_API_VERSION,
} = {}) {
  const hasProviderConfig = activeConfigCount > 0
  const hasGlobalVerifyToken = Boolean(env.WHATSAPP_VERIFY_TOKEN || env.WHATSAPP_WEBHOOK_VERIFY_TOKEN)
  const webhookConfigured = hasGlobalVerifyToken || hasProviderConfig
  const appSecretConfigured = Boolean(env.WHATSAPP_APP_SECRET)
  const confirmationJobEnabled = env.WHATSAPP_CONFIRMATION_JOB_ENABLED === 'true'
  const missing = []

  if (!hasProviderConfig) missing.push('whatsappClinicConfig ativa')
  if (!webhookConfigured) missing.push('WHATSAPP_VERIFY_TOKEN')
  if (!appSecretConfigured) missing.push('WHATSAPP_APP_SECRET')
  if (!confirmationJobEnabled) missing.push('WHATSAPP_CONFIRMATION_JOB_ENABLED=true')

  const readyForLive = hasProviderConfig && webhookConfigured && appSecretConfigured && confirmationJobEnabled
  const status = readyForLive ? 'READY' : (hasProviderConfig ? 'PARTIAL' : 'NOT_CONFIGURED')

  return {
    channel: 'whatsapp',
    status,
    readyForLive,
    provider: 'Meta WhatsApp Business API',
    graphApiVersion,
    activeConfigCount,
    webhookConfigured,
    appSecretConfigured,
    confirmationJobEnabled,
    confirmationWindowHours: 24,
    outboundLast24h,
    inboundLast24h,
    failedLast24h,
    missing,
    message: readyForLive
      ? 'WhatsApp pronto para lembretes, respostas SIM/NAO e auditoria de entrega.'
      : 'WhatsApp preparado em camada segura; faltam configuracoes para envio automatico em producao.',
  }
}

async function getWhatsAppOperationalSnapshot({ prisma, env = process.env, now = new Date() } = {}) {
  const since = new Date(now.getTime() - 24 * 60 * 60 * 1000)
  const [activeConfigCount, outboundLast24h, inboundLast24h, failedLast24h] = await Promise.all([
    countWhatsAppRecords(prisma?.whatsappClinicConfig, { where: { active: true } }),
    countWhatsAppRecords(prisma?.whatsappLog, { where: { direction: 'OUTBOUND', createdAt: { gte: since } } }),
    countWhatsAppRecords(prisma?.whatsappLog, { where: { direction: 'INBOUND', createdAt: { gte: since } } }),
    countWhatsAppRecords(prisma?.whatsappLog, { where: { status: 'FAILED', createdAt: { gte: since } } }),
  ])

  return buildWhatsAppReadiness({
    env,
    activeConfigCount,
    outboundLast24h,
    inboundLast24h,
    failedLast24h,
    graphApiVersion: env.WHATSAPP_GRAPH_API_VERSION || DEFAULT_GRAPH_API_VERSION,
  })
}

function registerWhatsAppRoutes({
  app,
  prisma,
  handle,
  authMiddleware,
  verifyToken = process.env.WHATSAPP_VERIFY_TOKEN || process.env.WHATSAPP_WEBHOOK_VERIFY_TOKEN,
  appSecret = process.env.WHATSAPP_APP_SECRET,
  logger = console,
}) {
  if (!app) throw new Error('registerWhatsAppRoutes requer app')
  if (!prisma) throw new Error('registerWhatsAppRoutes requer prisma')

  app.get('/webhooks/whatsapp', async (req, res, next) => {
    try {
      if (verifyToken && isWebhookVerificationValid(req.query, verifyToken)) {
        return res.status(200).send(req.query['hub.challenge'])
      }

      const clinicConfig = await findConfigForWebhook({
        prisma,
        verifyToken: req.query['hub.verify_token'],
      })

      if (clinicConfig && req.query['hub.mode'] === 'subscribe' && req.query['hub.challenge']) {
        return res.status(200).send(req.query['hub.challenge'])
      }

      return res.status(403).json({ error: 'Token de verificacao WhatsApp invalido' })
    } catch (error) {
      return next(error)
    }
  })

  const postHandler = async (req, res) => {
    const signature = req.headers['x-hub-signature-256']
    if (!isMetaSignatureValid({ signature, rawBody: req.rawBody, appSecret })) {
      return res.status(401).json({ error: 'Assinatura WhatsApp invalida' })
    }

    const result = await processWhatsAppWebhook({
      prisma,
      payload: req.body,
      logger,
    })

    res.json({ ok: true, ...result })
  }

  app.post('/webhooks/whatsapp', handle ? handle(postHandler) : postHandler)

  if (authMiddleware) {
    const statusHandler = async (_req, res) => {
      const whatsapp = await getWhatsAppOperationalSnapshot({ prisma, env: process.env })

      res.json({
        generatedAt: new Date().toISOString(),
        channels: { whatsapp },
        message: 'Status operacional de notificacoes sem expor tokens, secrets ou credenciais sensiveis.',
      })
    }

    app.get('/notifications/status', authMiddleware, handle ? handle(statusHandler) : statusHandler)
  }
}

function formatAppointmentDateTime(date) {
  return new Intl.DateTimeFormat('pt-BR', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  }).format(date)
}

function createProviderFromConfig(config, dependencies = {}) {
  const decryptAccessToken = dependencies.decryptAccessToken || (value => value)
  return new WhatsAppProvider({
    accessToken: decryptAccessToken(config.accessTokenEncrypted),
    phoneNumberId: config.phoneNumberId,
    graphApiVersion: config.graphApiVersion || DEFAULT_GRAPH_API_VERSION,
    fetchImpl: dependencies.fetchImpl || globalThis.fetch,
  })
}

function createAppointmentConfirmationJob({
  prisma,
  logger = console,
  now = () => new Date(),
  hoursAhead = 24,
  providerFactory = config => createProviderFromConfig(config),
} = {}) {
  if (!prisma) throw new Error('createAppointmentConfirmationJob requer prisma')

  return async function runAppointmentConfirmationJob() {
    if (!prisma.whatsappClinicConfig || !prisma.whatsappLog) {
      logger.warn?.('[whatsapp] Prisma Client ainda nao possui modelos WhatsApp gerados')
      return { sent: 0, skipped: 0, failed: 0 }
    }

    const startedAt = now()
    const until = new Date(startedAt.getTime() + hoursAhead * 60 * 60 * 1000)
    const configs = await prisma.whatsappClinicConfig.findMany({
      where: { active: true },
    })

    const summary = { sent: 0, skipped: 0, failed: 0 }

    for (const config of configs) {
      const appointments = await prisma.appointment.findMany({
        where: {
          userId: config.userId,
          status: 'SCHEDULED',
          startAt: {
            gte: startedAt,
            lte: until,
          },
        },
        include: {
          client: true,
          service: true,
          professional: true,
        },
        orderBy: { startAt: 'asc' },
      })

      const provider = providerFactory(config)

      for (const appointment of appointments) {
        const alreadySent = await prisma.whatsappLog.findFirst({
          where: {
            appointmentId: appointment.id,
            direction: 'OUTBOUND',
            templateName: config.appointmentTemplateName,
            status: { in: ['QUEUED', 'SENT', 'DELIVERED', 'READ'] },
          },
          select: { id: true },
        })

        if (alreadySent || !appointment.client?.phone) {
          summary.skipped += 1
          continue
        }

        try {
          const providerResponse = await provider.sendTemplateMessage({
            to: appointment.client.phone,
            templateName: config.appointmentTemplateName,
            languageCode: config.defaultLanguage,
            bodyParams: [
              appointment.client.name,
              appointment.service?.name || 'Atendimento',
              appointment.professional?.name || 'Equipe da clínica',
              formatAppointmentDateTime(appointment.startAt),
            ],
          })

          await writeWhatsAppLog({
            prisma,
            data: {
              userId: config.userId,
              configId: config.id,
              appointmentId: appointment.id,
              direction: 'OUTBOUND',
              messageType: 'TEMPLATE',
              providerMessageId: getProviderMessageId(providerResponse),
              recipientPhone: appointment.client.phone,
              templateName: config.appointmentTemplateName,
              status: 'SENT',
              payload: providerResponse,
            },
          })

          summary.sent += 1
        } catch (error) {
          await writeWhatsAppLog({
            prisma,
            data: {
              userId: config.userId,
              configId: config.id,
              appointmentId: appointment.id,
              direction: 'OUTBOUND',
              messageType: 'TEMPLATE',
              recipientPhone: appointment.client.phone,
              templateName: config.appointmentTemplateName,
              status: 'FAILED',
              errorCode: error.code || null,
              errorMessage: error.message,
              payload: error.response || null,
            },
          })

          logger.error?.('[whatsapp] appointment confirmation failed', {
            appointmentId: appointment.id,
            error: error.message,
          })
          summary.failed += 1
        }
      }
    }

    return summary
  }
}

function registerAppointmentConfirmationCron({ cron, job, expression = '*/15 * * * *' }) {
  if (!cron?.schedule) {
    throw new Error('Informe uma dependencia cron compativel, como node-cron')
  }

  if (typeof job !== 'function') {
    throw new Error('Informe o job de confirmacao WhatsApp')
  }

  return cron.schedule(expression, job)
}

module.exports = {
  WhatsAppProvider,
  WhatsAppProviderError,
  assertPhoneNumberId,
  buildMetaSignature,
  buildTemplateComponents,
  buildWhatsAppReadiness,
  createAppointmentConfirmationJob,
  createProviderFromConfig,
  extractWebhookEvents,
  findConfigForWebhook,
  getIncomingMessageText,
  getProviderMessageId,
  getWhatsAppOperationalSnapshot,
  handleInboundMessage,
  handleStatusEvent,
  isMetaSignatureValid,
  mapWhatsAppStatus,
  normalizePhoneNumber,
  normalizeReplyIntent,
  processWhatsAppWebhook,
  registerAppointmentConfirmationCron,
  registerWhatsAppRoutes,
  resolveAppointmentForInbound,
}
