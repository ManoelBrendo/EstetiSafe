const test = require('node:test')
const assert = require('node:assert/strict')

const {
  splitCsv,
  validateProductionEnvironment,
} = require('../lib/production-readiness')

function createProductionEnv(overrides = {}) {
  return {
    NODE_ENV: 'production',
    DATABASE_URL: 'postgresql://lappui:senha-forte@db.lappui.example:5432/lappui',
    JWT_SECRET: '1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef',
    FRONTEND_URL: 'https://app.lappui.example,https://clinicas.lappui.example',
    SUPPORT_ADMIN_EMAIL: 'suporte@lappui.example',
    SUPPORT_ADMIN_PASSWORD: 'A!@246813579246',
    SUPPORT_CONTACT_EMAIL: 'suporte@lappui.example',
    SUPPORT_CONTACT_PHONE: '5511999999999',
    BILLING_GATEWAY_PROVIDER: 'manual-ready',
    BILLING_WEBHOOK_SECRET: 'abcdef1234567890abcdef1234567890abcdef1234567890',
    WHATSAPP_CONFIRMATION_JOB_ENABLED: 'false',
    ...overrides,
  }
}

test('splitCsv normalizes comma-separated env values', () => {
  assert.deepEqual(splitCsv(' https://a.test,https://b.test ,, '), ['https://a.test', 'https://b.test'])
})

test('validateProductionEnvironment accepts a complete commercial environment', () => {
  const result = validateProductionEnvironment(createProductionEnv(), { forceProduction: true })

  assert.equal(result.ok, true)
  assert.equal(result.errors.length, 0)
  assert.ok(result.warnings.includes('BILLING_GATEWAY_PROVIDER está em manual-ready; pagamentos reais ainda dependem do provedor externo'))
})

test('validateProductionEnvironment rejects placeholders, missing origins, and local production URLs', () => {
  const result = validateProductionEnvironment(createProductionEnv({
    JWT_SECRET: 'troque_por_uma_chave_secreta_longa_e_aleatoria',
    FRONTEND_URL: 'http://localhost:5173',
    BILLING_WEBHOOK_SECRET: 'change-me',
    SUPPORT_ADMIN_PASSWORD: 'defina_uma_senha_forte',
  }), { forceProduction: true })

  assert.equal(result.ok, false)
  assert.ok(result.errors.some(error => error.includes('JWT_SECRET')))
  assert.ok(result.errors.some(error => error.includes('BILLING_WEBHOOK_SECRET')))
  assert.ok(result.errors.some(error => error.includes('SUPPORT_ADMIN_PASSWORD')))
  assert.ok(result.errors.some(error => error.includes('HTTPS')))
  assert.ok(result.errors.some(error => error.includes('localhost')))
})

test('validateProductionEnvironment requires WhatsApp secrets when automated confirmations are enabled', () => {
  const result = validateProductionEnvironment(createProductionEnv({
    WHATSAPP_CONFIRMATION_JOB_ENABLED: 'true',
    WHATSAPP_VERIFY_TOKEN: '',
    WHATSAPP_WEBHOOK_VERIFY_TOKEN: '',
    WHATSAPP_APP_SECRET: 'meta-app-secret',
  }), { forceProduction: true })

  assert.equal(result.ok, false)
  assert.ok(result.errors.some(error => error.includes('WhatsApp ativo exige WHATSAPP_VERIFY_TOKEN')))
  assert.ok(result.errors.some(error => error.includes('WHATSAPP_APP_SECRET')))
})