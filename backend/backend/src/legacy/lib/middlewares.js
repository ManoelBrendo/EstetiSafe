const jwt = require('jsonwebtoken')
const { rateLimit } = require('express-rate-limit')
const { Prisma } = require('@prisma/client')
const helpers = require('./helpers')

const JWT_SECRET = process.env.JWT_SECRET

// Rate Limiters
const generalLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: process.env.NODE_ENV === 'test' ? 10000 : 100,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Muitas requisições originadas deste IP. Por favor, tente novamente mais tarde.' },
})

const strictLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: process.env.NODE_ENV === 'test' ? 10000 : 15,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Tentativas de login, registro ou webhook excessivas. Por favor, tente novamente em 15 minutos.' },
})

// CSRF Cookie Parser Helper
function getCookie(req, name) {
  const cookieHeader = req.headers.cookie
  if (!cookieHeader) return null
  const cookies = cookieHeader.split(';').reduce((acc, cookie) => {
    const [key, ...val] = cookie.trim().split('=')
    acc[key] = val.join('=')
    return acc
  }, {})
  return cookies[name] || null
}

// Middlewares
function requireHttps(req, res, next) {
  if (process.env.NODE_ENV === 'production') {
    const proto = req.headers['x-forwarded-proto']
    if (proto && String(proto).toLowerCase() === 'http') {
      return res.redirect(301, `https://${req.headers.host}${req.originalUrl}`)
    }
  }
  next()
}

function sanitizePayload(req, res, next) {
  if (req.body) {
    helpers.sanitizeObject(req.body)
  }
  if (req.query) {
    helpers.sanitizeObject(req.query)
  }
  next()
}

function csrfCheck(req, res, next) {
  const writeMethods = ['POST', 'PUT', 'DELETE', 'PATCH']
  if (writeMethods.includes(req.method)) {
    const isBillingOrPayments = req.path.startsWith('/billing') || req.path.startsWith('/payments')
    if (isBillingOrPayments) {
      const isTestEnv = process.env.NODE_ENV === 'test' || require.main !== module
      if (isTestEnv && !req.headers['x-enforce-csrf-test']) {
        return next()
      }

      const xsrfToken = getCookie(req, 'XSRF-TOKEN')
      const xsrfHeader = req.headers['x-xsrf-token']

      if (!xsrfToken || !xsrfHeader || xsrfToken !== xsrfHeader) {
        return res.status(403).json({ error: 'Erro de validação de segurança: CSRF token inválido ou ausente.' })
      }
    }
  }
  next()
}

function requireSupportBillingControl(req, res, next) {
  if (req.user?.impersonatedBySupport) {
    return next()
  }

  if (req.user?.support) {
    return res.status(409).json({ error: 'Selecione uma clínica na central de suporte para alterar ou confirmar a assinatura.' })
  }

  return res.status(403).json({ error: 'Somente o login de suporte pode alterar valor ou confirmar pagamento da assinatura.' })
}

function requireSupport(req, res, next) {
  if (!req.user?.support) {
    return res.status(403).json({ error: 'Acesso restrito ao suporte técnico.' })
  }

  next()
}

function handle(fn) {
  return async (req, res, next) => {
    try {
      await fn(req, res)
    } catch (error) {
      next(error)
    }
  }
}

async function authMiddleware(req, res, next) {
  const authorization = req.headers.authorization || ''

  if (!authorization.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'Token ausente.' })
  }

  const token = authorization.slice('Bearer '.length).trim()

  if (!token) {
    return res.status(401).json({ error: 'Token ausente.' })
  }

  try {
    const payload = jwt.verify(token, JWT_SECRET)

    if (helpers.isSupportPayload(payload, helpers.SUPPORT_ADMIN_EMAIL)) {
      req.user = {
        ...payload,
        support: true,
      }
      req.currentUser = helpers.buildSupportUser({
        supportAdminEmail: helpers.SUPPORT_ADMIN_EMAIL,
        supportAdminName: helpers.SUPPORT_ADMIN_NAME,
      })
      req.billing = helpers.getSupportBillingSnapshot()
      req.supportContext = null
      return next()
    }

    const userId = helpers.parseId(payload.id, 'userId')
    const aggregateUser = await helpers.ensureClinicAggregate(userId)

    req.user = {
      ...payload,
      id: aggregateUser.id,
      email: aggregateUser.email,
      role: aggregateUser.role,
      support: false,
    }
    req.currentUser = aggregateUser
    req.billing = helpers.getBillingSnapshot(aggregateUser)
    req.supportContext = payload.impersonatedBySupport
      ? {
        active: true,
        supportEmail: payload.supportEmail || helpers.SUPPORT_ADMIN_EMAIL,
        supportName: payload.supportName || helpers.SUPPORT_ADMIN_NAME,
      }
      : null

    return next()
  } catch (error) {
    return res.status(401).json({ error: 'Token inválido.' })
  }
}

// Error Handler Middleware
function errorHandler(error, req, res, next) {
  if (error?.name === 'ZodError') {
    return res.status(422).json({ error: 'Dados inválidos', issues: error.errors })
  }

  if (error?.message === 'Origem não permitida pelo CORS') {
    return res.status(403).json({ error: error.message })
  }

  if (error?.code === 'P2002') {
    return res.status(409).json({ error: 'Registro duplicado' })
  }

  if (error?.code === 'P2025') {
    return res.status(404).json({ error: 'Não encontrado' })
  }

  if (
    error?.name === 'PrismaClientInitializationError' ||
    error instanceof Prisma.PrismaClientInitializationError
  ) {
    return res.status(503).json({ error: 'Banco de dados indisponível. Verifique a conexão e tente novamente.' })
  }

  if (error?.status) {
    return res.status(error.status).json({ error: error.message })
  }

  const errorId = `ERR-${Date.now()}-${Math.random().toString(36).substring(2, 8).toUpperCase()}`
  console.error(`[${errorId}] Unhandled server error:`, error)
  
  return res.status(500).json({ 
    error: 'Ocorreu um erro interno no servidor. Por favor, relate este código ao suporte se o problema persistir.',
    errorId 
  })
}

module.exports = {
  generalLimiter,
  strictLimiter,
  requireHttps,
  sanitizePayload,
  csrfCheck,
  requireSupportBillingControl,
  requireSupport,
  handle,
  authMiddleware,
  errorHandler,
}
