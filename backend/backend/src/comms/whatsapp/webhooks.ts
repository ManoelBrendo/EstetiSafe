import crypto from 'crypto'
import type {
  LoggerLike,
  WhatsAppDeliveryStatus,
  WhatsAppReplyIntent,
  WhatsAppWebhookMessagePayload,
  WhatsAppWebhookProcessResult,
  WhatsAppWebhookStatusPayload,
} from './types'
import { normalizePhoneNumber } from './WhatsAppProvider'

export function normalizeReplyIntent(text: string): WhatsAppReplyIntent | null {
  const normalized = String(text || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .trim()
    .toUpperCase()

  const compact = normalized.replace(/[^A-Z]/g, '')
  const yesValues = ['SIM', 'S', 'YES', 'CONFIRMO', 'CONFIRMAR', 'CONFIRMADO']
  const noValues = ['NAO', 'N', 'NO', 'CANCELAR', 'CANCELO', 'REMARCAR']

  if (yesValues.includes(normalized) || yesValues.includes(compact)) return 'YES'
  if (noValues.includes(normalized) || noValues.includes(compact)) return 'NO'
  return null
}

export function extractWebhookEvents(payload: any): { statuses: Array<{ phoneNumberId: string | null; status: WhatsAppWebhookStatusPayload }>; messages: Array<{ phoneNumberId: string | null; message: WhatsAppWebhookMessagePayload }> } {
  const statuses: Array<{ phoneNumberId: string | null; status: WhatsAppWebhookStatusPayload }> = []
  const messages: Array<{ phoneNumberId: string | null; message: WhatsAppWebhookMessagePayload }> = []

  for (const entry of payload?.entry || []) {
    for (const change of entry?.changes || []) {
      const value = change?.value || {}
      const phoneNumberId = value?.metadata?.phone_number_id || null

      for (const status of value.statuses || []) statuses.push({ phoneNumberId, status })
      for (const message of value.messages || []) messages.push({ phoneNumberId, message })
    }
  }

  return { statuses, messages }
}

function getIncomingMessageText(message: WhatsAppWebhookMessagePayload) {
  if (message?.type === 'text') return message?.text?.body || ''
  if (message?.button?.text) return message.button.text
  if (message?.interactive?.button_reply?.title) return message.interactive.button_reply.title
  if (message?.interactive?.list_reply?.title) return message.interactive.list_reply.title
  return ''
}

function mapWhatsAppStatus(status?: string | null): WhatsAppDeliveryStatus {
  const statusMap: Record<string, WhatsAppDeliveryStatus> = {
    sent: 'SENT',
    delivered: 'DELIVERED',
    read: 'READ',
    failed: 'FAILED',
  }

  return statusMap[String(status || '').toLowerCase()] || 'RECEIVED'
}

async function findConfigForWebhook(prisma: any, phoneNumberId?: string | null, verifyToken?: string | null) {
  if (!prisma?.whatsappClinicConfig) return null

  if (phoneNumberId) {
    const byPhoneNumber = await prisma.whatsappClinicConfig.findFirst({
      where: { phoneNumberId: String(phoneNumberId), active: true },
    })
    if (byPhoneNumber) return byPhoneNumber
  }

  if (verifyToken) {
    return prisma.whatsappClinicConfig.findFirst({
      where: { verifyToken: String(verifyToken), active: true },
    })
  }

  return null
}

async function resolveAppointmentForInbound({
  prisma,
  userId,
  senderPhone,
  contextMessageId,
  now = new Date(),
}: {
  prisma: any
  userId: number
  senderPhone?: string
  contextMessageId?: string | null
  now?: Date
}) {
  if (contextMessageId && prisma.whatsappLog) {
    const previousLog = await prisma.whatsappLog.findFirst({
      where: { providerMessageId: contextMessageId, appointmentId: { not: null } },
      select: { appointmentId: true },
      orderBy: { createdAt: 'desc' },
    })

    if (previousLog?.appointmentId) {
      return prisma.appointment.findFirst({
        where: { id: previousLog.appointmentId, userId },
        include: { client: true },
      })
    }
  }

  const sender = normalizePhoneNumber(senderPhone)
  if (!sender) return null

  const until = new Date(now.getTime() + 48 * 60 * 60 * 1000)
  const candidates = await prisma.appointment.findMany({
    where: {
      userId,
      status: { in: ['SCHEDULED', 'CONFIRMED'] },
      startAt: { gte: now, lte: until },
    },
    include: { client: true },
    orderBy: { startAt: 'asc' },
  })

  return candidates.find((appointment: any) => normalizePhoneNumber(appointment.client?.phone) === sender) || null
}

export async function processWhatsAppWebhook({
  prisma,
  payload,
  logger = console,
  now = new Date(),
}: {
  prisma: any
  payload: any
  logger?: LoggerLike
  now?: Date
}) {
  const { statuses, messages } = extractWebhookEvents(payload)
  const processed: WhatsAppWebhookProcessResult = { statuses: [], messages: [], ignored: 0 }

  for (const event of statuses) {
    const config = await findConfigForWebhook(prisma, event.phoneNumberId)
    if (!config) {
      processed.ignored += 1
      continue
    }

    const mappedStatus = mapWhatsAppStatus(event.status?.status)
    const providerMessageId = event.status?.id || null

    await prisma.whatsappLog.updateMany({
      where: { providerMessageId },
      data: { status: mappedStatus, payload: event.status },
    })

    await prisma.whatsappLog.create({
      data: {
        userId: config.userId,
        configId: config.id,
        direction: 'STATUS',
        messageType: 'STATUS',
        providerMessageId,
        recipientPhone: event.status?.recipient_id || null,
        status: mappedStatus,
        payload: event.status,
      },
    })

    processed.statuses.push({ providerMessageId, status: mappedStatus })
  }

  for (const event of messages) {
    const config = await findConfigForWebhook(prisma, event.phoneNumberId)
    if (!config) {
      processed.ignored += 1
      continue
    }

    const message = event.message
    const receivedText = getIncomingMessageText(message)
    const intent = normalizeReplyIntent(receivedText)
    const contextMessageId = message?.context?.id || null
    let appointment: { id: number | string } | null = null

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
        logger.warn?.('[whatsapp] inbound confirmation without appointment match')
      }
    }

    await prisma.whatsappLog.create({
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

    processed.messages.push({ providerMessageId: message?.id || null, appointmentId: appointment?.id || null, intent })
  }

  return processed
}

export function buildMetaSignature(rawBody: Buffer | string, appSecret: string) {
  return 'sha256=' + crypto.createHmac('sha256', appSecret).update(rawBody).digest('hex')
}

function safeCompareText(left: string, right: string) {
  const leftBuffer = Buffer.from(String(left || ''))
  const rightBuffer = Buffer.from(String(right || ''))
  return leftBuffer.length === rightBuffer.length && crypto.timingSafeEqual(leftBuffer, rightBuffer)
}

export function isMetaSignatureValid({
  signature,
  rawBody,
  appSecret,
}: {
  signature?: string
  rawBody?: Buffer | string
  appSecret?: string
}) {
  if (!appSecret) return true
  if (!signature || !rawBody) return false

  return safeCompareText(signature, buildMetaSignature(rawBody, appSecret))
}

export function createWhatsAppWebhookHandlers({
  prisma,
  verifyToken = process.env.WHATSAPP_VERIFY_TOKEN || process.env.WHATSAPP_WEBHOOK_VERIFY_TOKEN,
  appSecret = process.env.WHATSAPP_APP_SECRET,
  logger = console,
}: any) {
  return {
    verify: async (req: any, res: any) => {
      if (
        verifyToken
        && req.query['hub.mode'] === 'subscribe'
        && req.query['hub.verify_token'] === verifyToken
        && req.query['hub.challenge']
      ) {
        return res.status(200).send(req.query['hub.challenge'])
      }

      const config = await findConfigForWebhook(prisma, null, req.query['hub.verify_token'])
      if (config && req.query['hub.mode'] === 'subscribe' && req.query['hub.challenge']) {
        return res.status(200).send(req.query['hub.challenge'])
      }

      return res.status(403).json({ error: 'Token de verificacao WhatsApp invalido' })
    },
    receive: async (req: any, res: any) => {
      const signatureHeader = req.headers['x-hub-signature-256']
      const signature = Array.isArray(signatureHeader) ? signatureHeader[0] : signatureHeader
      if (!isMetaSignatureValid({ signature, rawBody: req.rawBody, appSecret })) {
        return res.status(401).json({ error: 'Assinatura WhatsApp invalida' })
      }

      const result = await processWhatsAppWebhook({ prisma, payload: req.body, logger })
      return res.json({ ok: true, ...result })
    },
  }
}
