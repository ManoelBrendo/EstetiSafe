import { WhatsAppProvider } from './WhatsAppProvider'
import type { LoggerLike, WhatsAppClinicConfig } from './types'

function formatAppointmentDateTime(date: Date) {
  return new Intl.DateTimeFormat('pt-BR', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  }).format(date)
}

export function createProviderFromConfig(
  config: WhatsAppClinicConfig,
  dependencies: { decryptAccessToken?: (value: string) => string; fetchImpl?: typeof fetch } = {},
) {
  const decryptAccessToken = dependencies.decryptAccessToken || ((value: string) => value)

  return new WhatsAppProvider({
    accessToken: decryptAccessToken(config.accessTokenEncrypted),
    phoneNumberId: config.phoneNumberId,
    fetchImpl: dependencies.fetchImpl || fetch,
  })
}

export function createAppointmentConfirmationJob({
  prisma,
  logger = console,
  now = () => new Date(),
  hoursAhead = 24,
  providerFactory = (config: WhatsAppClinicConfig) => createProviderFromConfig(config),
}: {
  prisma: any
  logger?: LoggerLike
  now?: () => Date
  hoursAhead?: number
  providerFactory?: (config: WhatsAppClinicConfig) => WhatsAppProvider
}) {
  return async function runAppointmentConfirmationJob() {
    const startedAt = now()
    const until = new Date(startedAt.getTime() + hoursAhead * 60 * 60 * 1000)
    const configs = await prisma.whatsappClinicConfig.findMany({ where: { active: true } })
    const summary = { sent: 0, skipped: 0, failed: 0 }

    for (const config of configs) {
      const appointments = await prisma.appointment.findMany({
        where: {
          userId: config.userId,
          status: 'SCHEDULED',
          startAt: { gte: startedAt, lte: until },
        },
        include: { client: true, service: true, professional: true },
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

          await prisma.whatsappLog.create({
            data: {
              userId: config.userId,
              configId: config.id,
              appointmentId: appointment.id,
              direction: 'OUTBOUND',
              messageType: 'TEMPLATE',
              providerMessageId: providerResponse?.messages?.[0]?.id || null,
              recipientPhone: appointment.client.phone,
              templateName: config.appointmentTemplateName,
              status: 'SENT',
              payload: providerResponse,
            },
          })

          summary.sent += 1
        } catch (error: any) {
          await prisma.whatsappLog.create({
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

          logger.error?.('[whatsapp] appointment confirmation failed', { appointmentId: appointment.id, error: error.message })
          summary.failed += 1
        }
      }
    }

    return summary
  }
}

export function registerAppointmentConfirmationCron({ cron, job, expression = '*/15 * * * *' }: any) {
  if (!cron?.schedule) throw new Error('Informe uma dependencia cron compativel, como node-cron')
  if (typeof job !== 'function') throw new Error('Informe o job de confirmacao WhatsApp')

  return cron.schedule(expression, job)
}
