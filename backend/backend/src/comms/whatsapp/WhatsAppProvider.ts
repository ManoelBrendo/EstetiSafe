import type { SendTemplateInput, WhatsAppProviderConfig, WhatsAppTemplateParam } from './types'

const DEFAULT_GRAPH_API_VERSION = process.env.WHATSAPP_GRAPH_API_VERSION || 'v21.0'
const DEFAULT_API_BASE_URL = 'https://graph.facebook.com'

export class WhatsAppProviderError extends Error {
  status: number | null
  code: string | null
  response: unknown

  constructor(message: string, details: { status?: number; code?: string; response?: unknown } = {}) {
    super(message)
    this.name = 'WhatsAppProviderError'
    this.status = details.status ?? null
    this.code = details.code ?? null
    this.response = details.response ?? null
  }
}

export function normalizePhoneNumber(value: string | null | undefined) {
  return String(value || '').replace(/\D/g, '')
}

export function assertPhoneNumberId(phoneNumberId: string) {
  const normalized = String(phoneNumberId || '').trim()
  if (!/^\d{6,32}$/.test(normalized)) {
    throw new WhatsAppProviderError('phoneNumberId invalido para WhatsApp Business')
  }
  return normalized
}

function toTemplateParameter(value: WhatsAppTemplateParam) {
  if (value && typeof value === 'object' && 'type' in value) return value

  return {
    type: 'text',
    text: value === null || value === undefined ? '' : String(value),
  }
}

export function buildTemplateComponents(input: Pick<SendTemplateInput, 'headerParams' | 'bodyParams' | 'buttonParams'> = {}) {
  const components: any[] = []

  if (input.headerParams?.length) {
    components.push({
      type: 'header',
      parameters: input.headerParams.map(toTemplateParameter),
    })
  }

  if (input.bodyParams?.length) {
    components.push({
      type: 'body',
      parameters: input.bodyParams.map(toTemplateParameter),
    })
  }

  for (const button of input.buttonParams || []) {
    components.push({
      type: 'button',
      sub_type: button.subType || 'url',
      index: String(button.index || 0),
      parameters: button.parameters.map(toTemplateParameter),
    })
  }

  return components
}

export class WhatsAppProvider {
  private accessToken: string
  private phoneNumberId: string
  private graphApiVersion: string
  private apiBaseUrl: string
  private fetchImpl: typeof fetch

  constructor({
    accessToken,
    phoneNumberId,
    graphApiVersion = DEFAULT_GRAPH_API_VERSION,
    apiBaseUrl = DEFAULT_API_BASE_URL,
    fetchImpl = fetch,
  }: WhatsAppProviderConfig) {
    if (!accessToken) throw new WhatsAppProviderError('Bearer token do WhatsApp nao informado')
    if (!fetchImpl) throw new WhatsAppProviderError('fetchImpl nao informado para WhatsAppProvider')

    this.accessToken = accessToken
    this.phoneNumberId = assertPhoneNumberId(phoneNumberId)
    this.graphApiVersion = graphApiVersion
    this.apiBaseUrl = apiBaseUrl.replace(/\/$/, '')
    this.fetchImpl = fetchImpl
  }

  async sendTemplateMessage(input: SendTemplateInput) {
    const recipient = normalizePhoneNumber(input.to)
    if (!recipient) throw new WhatsAppProviderError('Numero de destino invalido', { code: 'INVALID_RECIPIENT' })
    if (!input.templateName) throw new WhatsAppProviderError('Nome do template WhatsApp nao informado', { code: 'INVALID_TEMPLATE' })

    const components = buildTemplateComponents(input)
    const payload = {
      messaging_product: 'whatsapp',
      to: recipient,
      type: 'template',
      template: {
        name: input.templateName,
        language: { code: input.languageCode || 'pt_BR' },
        ...(components.length > 0 ? { components } : {}),
      },
    }

    const response = await this.fetchImpl(`${this.apiBaseUrl}/${this.graphApiVersion}/${this.phoneNumberId}/messages`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${this.accessToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(payload),
    })

    const responseBody = await response.json().catch(() => ({}))
    if (!response.ok) {
      const metaError = (responseBody as any)?.error || {}
      throw new WhatsAppProviderError(metaError.message || 'Falha ao enviar mensagem WhatsApp', {
        status: response.status,
        code: metaError.code || metaError.type || 'WHATSAPP_SEND_FAILED',
        response: responseBody,
      })
    }

    return responseBody
  }
}
