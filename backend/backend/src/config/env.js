const { z } = require('zod')
const path = require('path')

// Carrega o dotenv para garantir que process.env esteja populado
const backendRoot = path.resolve(__dirname, '..', '..')
require('dotenv').config({ path: path.join(backendRoot, '.env') })

const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
  PORT: z.coerce.number().default(3000),
  DATABASE_URL: z.string().min(1),
  JWT_SECRET: z.string().min(1),
  FRONTEND_URL: z.string().default(''),
  
  // Credenciais do Administrador de Suporte
  SUPPORT_ADMIN_EMAIL: z.string().email().default('suporte@lappui.com'),
  SUPPORT_ADMIN_PASSWORD: z.string().default('defina_uma_senha_forte'),
  SUPPORT_ADMIN_NAME: z.string().default('Central de suporte'),

  // Informações de contato do Suporte publicadas
  SUPPORT_CONTACT_NAME: z.string().default("Suporte L'Appui"),
  SUPPORT_CONTACT_EMAIL: z.string().default('suporte@lappui.com'),
  SUPPORT_CONTACT_PHONE: z.string().default(''),

  // Gateway de Pagamentos / Stripe
  BILLING_GATEWAY_PROVIDER: z.string().default('manual-ready'),
  BILLING_WEBHOOK_SECRET: z.string().default('troque_por_um_segredo_de_webhook_financeiro'),
  STRIPE_WEBHOOK_SECRET: z.string().optional(),
  ASAAS_WEBHOOK_TOKEN: z.string().optional(),

  // Configurações do WhatsApp
  WHATSAPP_VERIFY_TOKEN: z.string().default('change-me'),
  WHATSAPP_WEBHOOK_VERIFY_TOKEN: z.string().default('change-me'),
  WHATSAPP_APP_SECRET: z.string().default('meta-app-secret'),
  WHATSAPP_GRAPH_API_VERSION: z.string().default('v21.0'),
  WHATSAPP_TOKEN_ENCRYPTION_KEY: z.string().optional(),
  WHATSAPP_CONFIRMATION_JOB_ENABLED: z.string().default('false'),
  WHATSAPP_CONFIRMATION_JOB_INTERVAL_MS: z.coerce.number().default(15 * 60 * 1000),

  // Automação de cobrança de assinaturas
  BILLING_AUTO_CHARGE_ENABLED: z.string().default('true'),
  BILLING_AUTO_METHOD: z.string().default('PIX'),
  BILLING_AUTO_LOOKAHEAD_DAYS: z.coerce.number().default(3),
  BILLING_AUTO_CHARGE_INTERVAL_MINUTES: z.coerce.number().default(60),
  BILLING_AUTO_CHARGE_INITIAL_DELAY_MS: z.coerce.number().default(30000),
  BILLING_AUTO_BATCH_LIMIT: z.coerce.number().default(50),
})

const result = envSchema.safeParse(process.env)

if (!result.success) {
  console.error('❌ Erro crítico de validação das variáveis de ambiente (.env):')
  const errors = result.error.format()
  for (const [key, value] of Object.entries(errors)) {
    if (key !== '_errors') {
      console.error(`- ${key}: ${value._errors.join(', ')}`)
    }
  }
  process.exit(1)
}

module.exports = result.data
