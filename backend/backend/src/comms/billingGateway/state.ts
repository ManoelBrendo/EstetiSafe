import crypto from 'crypto'
import type {
  BillingGatewayIntentStatus,
  BillingGatewayPaymentMethod,
  StripeCheckoutSessionInput,
  StripeCheckoutSessionOutput,
} from './types'

export const BILLING_GATEWAY_INTENT_STATUSES = ['PENDING', 'PAID', 'FAILED', 'CANCELLED', 'EXPIRED'] as const

export const BILLING_GATEWAY_PAYMENT_METHODS = ['PIX', 'CREDIT_CARD', 'BANK_TRANSFER'] as const

export const BILLING_GATEWAY_TERMINAL_STATUSES = ['PAID', 'FAILED', 'CANCELLED', 'EXPIRED'] as const

export const BILLING_GATEWAY_STATUS_LABELS: Record<BillingGatewayIntentStatus, string> = {
  PENDING: 'Cobrança pendente',
  PAID: 'Pagamento confirmado',
  FAILED: 'Falha no pagamento',
  CANCELLED: 'Cobrança cancelada',
  EXPIRED: 'Cobrança expirada',
}

export const BILLING_GATEWAY_METHOD_LABELS: Record<BillingGatewayPaymentMethod, string> = {
  PIX: 'Pix',
  CREDIT_CARD: 'Cartao de credito',
  BANK_TRANSFER: 'Transferencia bancaria',
}

export function isBillingGatewayIntentStatus(value: unknown): value is BillingGatewayIntentStatus {
  const normalized = String(value || '').toUpperCase()
  return (BILLING_GATEWAY_INTENT_STATUSES as readonly string[]).includes(normalized)
}

export function isBillingGatewayPaymentMethod(value: unknown): value is BillingGatewayPaymentMethod {
  const normalized = String(value || '').toUpperCase()
  return (BILLING_GATEWAY_PAYMENT_METHODS as readonly string[]).includes(normalized)
}

export function normalizeBillingGatewayStatus(
  value: unknown,
  fallback: BillingGatewayIntentStatus = 'PENDING',
): BillingGatewayIntentStatus {
  const normalized = String(value || fallback).toUpperCase()
  return isBillingGatewayIntentStatus(normalized) ? normalized : fallback
}

export function normalizeBillingGatewayPaymentMethod(
  value: unknown,
  fallback: BillingGatewayPaymentMethod = 'PIX',
): BillingGatewayPaymentMethod {
  const normalized = String(value || fallback).toUpperCase()
  return isBillingGatewayPaymentMethod(normalized) ? normalized : fallback
}

export function isTerminalBillingGatewayStatus(value: unknown): boolean {
  const status = normalizeBillingGatewayStatus(value)
  return (BILLING_GATEWAY_TERMINAL_STATUSES as readonly string[]).includes(status)
}

export function getBillingGatewayStatusLabel(value: unknown): string {
  return BILLING_GATEWAY_STATUS_LABELS[normalizeBillingGatewayStatus(value)]
}

export function getBillingGatewayPaymentMethodLabel(value: unknown): string {
  return BILLING_GATEWAY_METHOD_LABELS[normalizeBillingGatewayPaymentMethod(value)]
}

export function createGatewayReference(clinicId: number | string): string {
  const stamp = Date.now().toString(36).toUpperCase()
  const random = crypto.randomBytes(3).toString('hex').toUpperCase()
  return 'LAPPUI-' + clinicId + '-' + stamp + '-' + random
}

export function getGatewayProviderName(env: Record<string, string | undefined> = process.env): string {
  const provider = env.BILLING_GATEWAY_PROVIDER || 'MANUAL_READY'
  return provider.toUpperCase()
}

export function verifyStripeSignature(rawBody: Buffer | null, signatureHeader: string | undefined, secret: string): boolean {
  if (!rawBody || !signatureHeader || !secret) return false

  const parts = String(signatureHeader).split(',')
  const tPart = parts.find(p => p.startsWith('t='))
  const v1Part = parts.find(p => p.startsWith('v1='))

  if (!tPart || !v1Part) return false

  const t = tPart.substring(2)
  const v1 = v1Part.substring(3)

  const signaturePayload = t + '.' + rawBody.toString('utf8')
  const computed = crypto
    .createHmac('sha256', secret)
    .update(signaturePayload)
    .digest('hex')

  try {
    const computedBuf = Buffer.from(computed, 'hex')
    const v1Buf = Buffer.from(v1, 'hex')
    if (computedBuf.length !== v1Buf.length) return false
    return crypto.timingSafeEqual(computedBuf, v1Buf)
  } catch (error) {
    return false
  }
}

export async function createStripeCheckoutSession({
  amount,
  dueAt,
  reference,
  clinicId,
  env = process.env,
}: StripeCheckoutSessionInput): Promise<StripeCheckoutSessionOutput> {
  const stripeSecretKey = env.STRIPE_SECRET_KEY
  if (!stripeSecretKey) {
    throw new Error('STRIPE_SECRET_KEY nao configurada no ambiente')
  }

  const amountInCents = Math.round(amount * 100)
  const frontendUrl = (env.FRONTEND_URL || 'http://localhost:5173').split(',')[0].trim()

  const params = new URLSearchParams()
  params.append('success_url', frontendUrl + '/billing?success=true&reference=' + reference)
  params.append('cancel_url', frontendUrl + '/billing?cancel=true&reference=' + reference)
  params.append('mode', 'payment')
  params.append('line_items[0][price_data][currency]', 'brl')
  params.append('line_items[0][price_data][product_data][name]', 'Assinatura EstetiSafe')
  params.append('line_items[0][price_data][unit_amount]', String(amountInCents))
  params.append('line_items[0][quantity]', '1')
  params.append('metadata[reference]', reference)
  params.append('metadata[clinicId]', String(clinicId))

  const response = await fetch('https://api.stripe.com/v1/checkout/sessions', {
    method: 'POST',
    headers: {
      'Authorization': 'Bearer ' + stripeSecretKey,
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: params.toString(),
  })

  if (!response.ok) {
    const errorText = await response.text()
    throw new Error('Erro na API do Stripe: ' + errorText)
  }

  const session = await response.json() as { id: string; url: string | null }
  return {
    providerPaymentId: session.id,
    checkoutUrl: session.url,
    pixCopyPaste: null,
    status: 'PENDING',
    payload: session,
  }
}
