export type WhatsAppTemplateParam =
  | string
  | number
  | boolean
  | {
      type: string
      [key: string]: unknown
    }

export type WhatsAppButtonParam = {
  index?: number | string
  subType?: 'quick_reply' | 'url'
  parameters: WhatsAppTemplateParam[]
}

export type SendTemplateInput = {
  to: string
  templateName: string
  languageCode?: string
  headerParams?: WhatsAppTemplateParam[]
  bodyParams?: WhatsAppTemplateParam[]
  buttonParams?: WhatsAppButtonParam[]
}

export type WhatsAppProviderConfig = {
  accessToken: string
  phoneNumberId: string
  graphApiVersion?: string
  apiBaseUrl?: string
  fetchImpl?: typeof fetch
}

export type WhatsAppClinicConfig = {
  id: number
  userId: number
  phoneNumberId: string
  businessAccountId?: string | null
  accessTokenEncrypted: string
  verifyToken: string
  defaultLanguage: string
  appointmentTemplateName: string
  consentTemplateName: string
  active: boolean
}

export type WhatsAppWebhookEvent = {
  phoneNumberId: string | null
  status?: Record<string, any>
  message?: Record<string, any>
}

export type LoggerLike = {
  warn?: (...args: any[]) => void
  error?: (...args: any[]) => void
  info?: (...args: any[]) => void
}

export type WhatsAppReplyIntent = 'YES' | 'NO'

export type WhatsAppDeliveryStatus = 'SENT' | 'DELIVERED' | 'READ' | 'FAILED' | 'RECEIVED'

export type WhatsAppWebhookStatusPayload = {
  id?: string
  status?: string
  recipient_id?: string
  errors?: unknown
  [key: string]: unknown
}

export type WhatsAppWebhookMessagePayload = {
  id?: string
  from?: string
  type?: string
  text?: { body?: string }
  button?: { text?: string }
  interactive?: {
    button_reply?: { title?: string }
    list_reply?: { title?: string }
  }
  context?: { id?: string }
  [key: string]: unknown
}

export type WhatsAppWebhookStatusEvent = {
  phoneNumberId: string | null
  status: WhatsAppWebhookStatusPayload
}

export type WhatsAppWebhookMessageEvent = {
  phoneNumberId: string | null
  message: WhatsAppWebhookMessagePayload
}

export type WhatsAppWebhookProcessResult = {
  statuses: Array<{ providerMessageId: string | null; status: WhatsAppDeliveryStatus }>
  messages: Array<{ providerMessageId: string | null; appointmentId: number | string | null; intent: WhatsAppReplyIntent | null }>
  ignored: number
}
