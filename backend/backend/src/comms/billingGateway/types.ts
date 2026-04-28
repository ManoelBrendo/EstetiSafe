export type BillingGatewayIntentStatus = 'PENDING' | 'PAID' | 'FAILED' | 'CANCELLED' | 'EXPIRED'

export type BillingGatewayPaymentMethod = 'PIX' | 'CREDIT_CARD' | 'BANK_TRANSFER'

export type BillingGatewayPersistenceMode = 'database' | 'audit_log_fallback'

export type BillingGatewayMode = 'provider_agnostic'

export type BillingGatewayIntent = {
  id?: number | string
  provider: string
  reference: string | null
  clinicId: number | null
  amount: number | null
  currency: 'BRL' | string
  status: BillingGatewayIntentStatus
  paymentMethod: BillingGatewayPaymentMethod
  dueAt: string | null
  expiresAt: string | null
  checkoutUrl: string | null
  pixCopyPaste: string | null
  message: string | null
  createdAt?: string | null
  paidAt?: string | null
  providerPaymentId?: string | null
  eventCount?: number
}

export type CreateBillingGatewayIntentInput = {
  clinicId: number
  amount: number
  dueAt: Date | string
  method?: BillingGatewayPaymentMethod
  reference: string
}

export type BillingGatewayWebhookEvent = {
  reference: string
  status: BillingGatewayIntentStatus
  amount?: number
  paidAt?: string
  nextDueAt?: string
  provider?: string
  providerPaymentId?: string
  metadata?: Record<string, unknown>
}

export type BillingGatewayAutomationConfig = {
  enabled: boolean
  method: BillingGatewayPaymentMethod
  lookAheadDays: number
  intervalMinutes: number
  message: string
}

export type BillingGatewayStatusSnapshot = {
  provider: string
  mode: BillingGatewayMode
  persistence: BillingGatewayPersistenceMode
  configured: boolean
  webhookConfigured: boolean
  automation: BillingGatewayAutomationConfig
  latestIntent: BillingGatewayIntent | null
  message: string
}
