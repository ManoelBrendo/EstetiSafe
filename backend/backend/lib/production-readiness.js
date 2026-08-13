const PLACEHOLDER_PATTERNS = [
  /change[-_ ]?me/i,
  /troque/i,
  /defina/i,
  /sua_senha/i,
  /meta-app-secret/i,
  /secret$/i,
]

function splitCsv(value) {
  return String(value || '')
    .split(',')
    .map(item => item.trim())
    .filter(Boolean)
}

function hasValue(env, key) {
  return Boolean(String(env[key] || '').trim())
}

function hasPlaceholder(value) {
  const normalized = String(value || '').trim()
  return !normalized || PLACEHOLDER_PATTERNS.some(pattern => pattern.test(normalized))
}

function isLocalHost(hostname) {
  return ['localhost', '127.0.0.1', '0.0.0.0', '10.0.2.2'].includes(String(hostname || '').toLowerCase())
}

function validateHttpsOrigin(origin) {
  try {
    const parsed = new URL(origin)
    if (parsed.protocol !== 'https:') return `${origin} precisa usar HTTPS em produção`
    if (isLocalHost(parsed.hostname)) return `${origin} não pode apontar para localhost em produção`
    return null
  } catch {
    return `${origin} não é uma URL válida`
  }
}

function validateProductionEnvironment(env = process.env, options = {}) {
  const forceProduction = Boolean(options.forceProduction)
  const isProduction = forceProduction || env.NODE_ENV === 'production'
  const errors = []
  const warnings = []

  if (!isProduction) {
    return { ok: true, isProduction: false, errors, warnings }
  }

  const requiredKeys = [
    'DATABASE_URL',
    'JWT_SECRET',
    'FRONTEND_URL',
    'SUPPORT_ADMIN_EMAIL',
    'SUPPORT_ADMIN_PASSWORD',
    'BILLING_WEBHOOK_SECRET',
  ]

  requiredKeys.forEach(key => {
    if (!hasValue(env, key)) errors.push(`${key} é obrigatório em produção`)
  })

  if (hasValue(env, 'DATABASE_URL') && !String(env.DATABASE_URL).startsWith('postgresql://')) {
    errors.push('DATABASE_URL precisa apontar para PostgreSQL')
  }

  if (hasPlaceholder(env.JWT_SECRET) || String(env.JWT_SECRET || '').length < 48) {
    errors.push('JWT_SECRET precisa ser uma chave longa, aleatória e sem valor de exemplo')
  }

  if (hasPlaceholder(env.BILLING_WEBHOOK_SECRET) || String(env.BILLING_WEBHOOK_SECRET || '').length < 32) {
    errors.push('BILLING_WEBHOOK_SECRET precisa ser longo, aleatório e sem valor de exemplo')
  }

  if (hasPlaceholder(env.SUPPORT_ADMIN_PASSWORD) || String(env.SUPPORT_ADMIN_PASSWORD || '').length < 12) {
    errors.push('SUPPORT_ADMIN_PASSWORD precisa ser forte e não pode usar valor de exemplo')
  }

  const frontendOrigins = splitCsv(env.FRONTEND_URL)
  if (!frontendOrigins.length) {
    errors.push('FRONTEND_URL precisa conter pelo menos uma origem do frontend')
  }

  frontendOrigins.forEach(origin => {
    const error = validateHttpsOrigin(origin)
    if (error) errors.push(error)
  })

  if (!hasValue(env, 'SUPPORT_CONTACT_EMAIL') && !hasValue(env, 'SUPPORT_CONTACT_PHONE')) {
    warnings.push('Defina SUPPORT_CONTACT_EMAIL ou SUPPORT_CONTACT_PHONE para atendimento comercial')
  }

  if (env.BILLING_GATEWAY_PROVIDER === 'manual-ready') {
    warnings.push('BILLING_GATEWAY_PROVIDER está em manual-ready; pagamentos reais ainda dependem do provedor externo')
  }

  if (env.WHATSAPP_CONFIRMATION_JOB_ENABLED === 'true') {
    if (!hasValue(env, 'WHATSAPP_VERIFY_TOKEN') && !hasValue(env, 'WHATSAPP_WEBHOOK_VERIFY_TOKEN')) {
      errors.push('WhatsApp ativo exige WHATSAPP_VERIFY_TOKEN ou WHATSAPP_WEBHOOK_VERIFY_TOKEN')
    }

    if (hasPlaceholder(env.WHATSAPP_APP_SECRET)) {
      errors.push('WhatsApp ativo exige WHATSAPP_APP_SECRET real')
    }
  }

  return {
    ok: errors.length === 0,
    isProduction: true,
    errors,
    warnings,
  }
}

function assertProductionReady(env = process.env) {
  const result = validateProductionEnvironment(env)

  if (!result.ok) {
    throw new Error(`Ambiente de produção incompleto:\n- ${result.errors.join('\n- ')}`)
  }

  result.warnings.forEach(warning => console.warn(`[production-readiness] ${warning}`))
  return result
}

function securityHeaders(req, res, next) {
  res.setHeader('X-Content-Type-Options', 'nosniff')
  res.setHeader('X-Frame-Options', 'DENY')
  res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin')
  res.setHeader('Permissions-Policy', 'camera=(), microphone=(), geolocation=()')
  res.setHeader('Content-Security-Policy', "default-src 'self'; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; font-src 'self' https://fonts.gstatic.com; img-src 'self' data:; connect-src 'self'; frame-ancestors 'none'; object-src 'none'; base-uri 'self'; form-action 'self';")

  if (process.env.NODE_ENV === 'production') {
    res.setHeader('Strict-Transport-Security', 'max-age=15552000; includeSubDomains')
  }

  next()
}

module.exports = {
  assertProductionReady,
  securityHeaders,
  splitCsv,
  validateProductionEnvironment,
}