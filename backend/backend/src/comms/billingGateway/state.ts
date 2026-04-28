import type { BillingGatewayIntentStatus, BillingGatewayPaymentMethod } from './types'

export const BILLING_GATEWAY_INTENT_STATUSES = ['PENDING', 'PAID', 'FAILED', 'CANCELLED', 'EXPIRED'] as const

export const BILLING_GATEWAY_PAYMENT_METHODS = ['PIX', 'CREDIT_CARD', 'BANK_TRANSFER'] as const

export const BILLING_GATEWAY_TERMINAL_STATUSES = ['PAID', 'FAILED', 'CANCELLED', 'EXPIRED'] as const

export const BILLING_GATEWAY_STATUS_LABELS: Record<BillingGatewayIntentStatus, string> = {
  PENDING: 'Cobranca pendente',
  PAID: 'Pagamento confirmado',
  FAILED: 'Falha no pagamento',
  CANCELLED: 'Cobranca cancelada',
  EXPIRED: 'Cobranca expirada',
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
