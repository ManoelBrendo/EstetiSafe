const crypto = require('node:crypto')
const bcrypt = require('bcryptjs')
const jwt = require('jsonwebtoken')
const { httpError } = require('./http')

function addDays(date, days) {
  const result = new Date(date)
  result.setDate(result.getDate() + days)
  return result
}

function safeEqualText(left, right) {
  const leftBuffer = Buffer.from(String(left || ''), 'utf8')
  const rightBuffer = Buffer.from(String(right || ''), 'utf8')

  if (leftBuffer.length !== rightBuffer.length) {
    return false
  }

  return crypto.timingSafeEqual(leftBuffer, rightBuffer)
}

function mapBillingStatusToClinicStatus(status) {
  return status === 'BLOCKED' ? 'SUSPENDED' : 'ACTIVE'
}

function buildClinicAggregateSeed(user) {
  const status = user.billingStatus || 'TRIAL'
  const graceEndsAt = user.billingGraceEndsAt || addDays(user.createdAt || new Date(), 7)

  return {
    clinic: {
      name: user.clinicName,
      logoDataUrl: user.clinicLogoDataUrl || null,
      status: mapBillingStatusToClinicStatus(status),
    },
    subscription: {
      status,
      amount: user.billingAmount ?? null,
      graceEndsAt,
      lastPaidAt: user.billingLastPaidAt ?? null,
      nextDueAt: user.billingNextDueAt ?? null,
      reference: user.billingReference ?? null,
      notes: user.billingNotes ?? null,
    },
  }
}

function mergeLegacyUserAggregate(user) {
  if (!user || user.ownedClinic) {
    return user
  }

  const seed = buildClinicAggregateSeed(user)
  return {
    ...user,
    ownedClinic: {
      id: null,
      ownerUserId: user.id,
      createdAt: user.createdAt,
      updatedAt: user.updatedAt,
      ...seed.clinic,
      subscription: {
        id: null,
        clinicId: null,
        createdAt: user.createdAt,
        updatedAt: user.updatedAt,
        ...seed.subscription,
      },
    },
  }
}

function buildSupportUser(config) {
  return {
    id: 0,
    email: config.supportAdminEmail,
    clinicName: config.supportAdminName,
    clinicLogoDataUrl: null,
    role: 'SUPPORT',
    createdAt: new Date(0),
  }
}

function getSupportContact(config) {
  return {
    name: config.supportContactName,
    email: config.supportContactEmail,
    phone: config.supportContactPhone,
  }
}

function getSupportBillingSnapshot() {
  return {
    status: 'ACTIVE',
    effectiveStatus: 'ACTIVE',
    blocked: false,
    amount: null,
    reference: null,
    notes: null,
    graceEndsAt: null,
    lastPaidAt: null,
    nextDueAt: null,
    blockAt: null,
    daysRemaining: null,
    message: 'Acesso tecnico liberado para suporte e manutencao.',
  }
}

function getBillingSnapshot(user) {
  const aggregateUser = mergeLegacyUserAggregate(user)
  const now = new Date()
  const subscription = aggregateUser.ownedClinic?.subscription || buildClinicAggregateSeed(aggregateUser).subscription
  const graceEndsAt = subscription.graceEndsAt || addDays(aggregateUser.createdAt || now, 7)
  const dueAnchor = subscription.nextDueAt || graceEndsAt
  const blockAt = addDays(dueAnchor, 7)

  let effectiveStatus = subscription.status || 'TRIAL'
  let blocked = false

  if (effectiveStatus === 'ACTIVE' && subscription.nextDueAt && now > subscription.nextDueAt) {
    effectiveStatus = now > blockAt ? 'BLOCKED' : 'OVERDUE'
  } else if (effectiveStatus !== 'ACTIVE' && now > graceEndsAt) {
    effectiveStatus = 'BLOCKED'
  }

  if (effectiveStatus === 'BLOCKED') {
    blocked = true
  }

  const diffBase = effectiveStatus === 'ACTIVE'
    ? (subscription.nextDueAt || graceEndsAt)
    : blockAt
  const daysRemaining = Math.max(0, Math.ceil((diffBase.getTime() - now.getTime()) / 86400000))

  let message = 'Configure o valor e a proxima cobranca da assinatura.'
  if (effectiveStatus === 'BLOCKED') {
    message = 'Acesso da clinica bloqueado ate a confirmacao do pagamento.'
  } else if (effectiveStatus === 'OVERDUE') {
    message = 'Pagamento em atraso. O acesso sera bloqueado apos o periodo de tolerancia.'
  } else if (effectiveStatus === 'ACTIVE') {
    message = 'Assinatura em dia.'
  }

  return {
    status: subscription.status || 'TRIAL',
    effectiveStatus,
    blocked,
    amount: subscription.amount ?? null,
    reference: subscription.reference ?? null,
    notes: subscription.notes ?? null,
    graceEndsAt,
    lastPaidAt: subscription.lastPaidAt ?? null,
    nextDueAt: subscription.nextDueAt ?? null,
    blockAt,
    daysRemaining,
    message,
  }
}

function serializeUser(user, options = {}) {
  const aggregateUser = mergeLegacyUserAggregate(user)
  const billing = options.billing || getBillingSnapshot(aggregateUser)

  return {
    id: aggregateUser.id,
    email: aggregateUser.email,
    clinicName: aggregateUser.clinicName,
    clinicLogoDataUrl: aggregateUser.clinicLogoDataUrl,
    role: aggregateUser.role,
    createdAt: aggregateUser.createdAt,
    clinicId: aggregateUser.ownedClinic?.id || null,
    clinicStatus: aggregateUser.ownedClinic?.status || mapBillingStatusToClinicStatus(billing.status),
    billing,
    supportContext: options.supportContext || null,
    supportContact: options.supportContact || getSupportContact(options.config),
  }
}

function createAuthToolkit(config) {
  const userAggregateInclude = {
    ownedClinic: {
      include: {
        subscription: true,
      },
    },
  }

  function signToken(payload) {
    return jwt.sign(payload, config.jwtSecret, { expiresIn: '7d' })
  }

  function hasSupportCredentials() {
    return Boolean(config.supportAdminEmail && config.supportAdminPassword)
  }

  function isSupportPayload(payload) {
    return Boolean(
      payload?.support === true
      && payload?.role === 'SUPPORT'
      && payload?.email === config.supportAdminEmail
    )
  }

  async function loadScopedUser(userId) {
    const user = await config.prisma.user.findUnique({
      where: { id: userId },
      include: userAggregateInclude,
    })

    if (!user) {
      throw httpError(401, 'Usuario nao encontrado.')
    }

    return mergeLegacyUserAggregate(user)
  }

  function serializeSupportUser() {
    return {
      ...serializeUser(buildSupportUser(config), {
        billing: getSupportBillingSnapshot(),
        supportContact: getSupportContact(config),
        config,
      }),
      support: true,
    }
  }

  async function login(payload) {
    const email = String(payload.email || '').trim().toLowerCase()
    const password = String(payload.password || '')

    if (hasSupportCredentials() && email === config.supportAdminEmail) {
      if (!safeEqualText(password, config.supportAdminPassword)) {
        throw httpError(401, 'Credenciais invalidas.')
      }

      return {
        token: signToken({
          support: true,
          role: 'SUPPORT',
          email: config.supportAdminEmail,
          supportName: config.supportAdminName,
        }),
        user: serializeSupportUser(),
      }
    }

    const userRecord = await config.prisma.user.findUnique({ where: { email } })
    if (!userRecord) {
      throw httpError(404, 'Nenhuma conta encontrada para este e-mail.')
    }

    const passwordMatches = await bcrypt.compare(password, userRecord.hashedPassword)
    if (!passwordMatches) {
      throw httpError(401, 'Credenciais invalidas.')
    }

    const user = await loadScopedUser(userRecord.id)
    return {
      token: signToken({ id: user.id, email: user.email, role: user.role }),
      user: serializeUser(user, { config }),
    }
  }

  async function authMiddleware(req, res, next) {
    const header = req.headers.authorization
    if (!header || !header.startsWith('Bearer ')) {
      return next(httpError(401, 'Token ausente.'))
    }

    let payload
    try {
      payload = jwt.verify(header.slice(7), config.jwtSecret)
    } catch {
      return next(httpError(401, 'Token invalido.'))
    }

    req.user = payload

    if (isSupportPayload(payload)) {
      req.currentUser = null
      req.billing = getSupportBillingSnapshot()
      req.supportContext = {
        active: false,
        supportEmail: config.supportAdminEmail,
        supportName: config.supportAdminName,
      }
      return next()
    }

    try {
      const userId = Number(payload.id)
      if (!Number.isInteger(userId) || userId <= 0) {
        throw httpError(401, 'Token invalido.')
      }

      const user = await loadScopedUser(userId)
      req.currentUser = user
      req.billing = getBillingSnapshot(user)
      req.supportContext = payload.impersonatedBySupport
        ? {
          active: true,
          supportEmail: payload.supportEmail || config.supportAdminEmail,
          supportName: payload.supportName || config.supportAdminName,
        }
        : null

      const bypassBillingBlock = Boolean(payload.impersonatedBySupport)
      const allowBlockedRoute = bypassBillingBlock || req.path === '/me' || req.path.startsWith('/billing')
      if (req.billing.blocked && !allowBlockedRoute) {
        throw httpError(402, 'Acesso da clinica bloqueado ate a confirmacao do pagamento.')
      }

      return next()
    } catch (error) {
      return next(error)
    }
  }

  function requireSupport(req, res, next) {
    if (!req.user?.support) {
      return next(httpError(403, 'Acesso restrito ao suporte tecnico.'))
    }

    return next()
  }

  function requireScopedClinicUser(req, res, next) {
    if (req.user?.support && !req.user?.impersonatedBySupport) {
      return next(httpError(409, 'Selecione uma clinica na central de suporte para acessar dados clinicos.'))
    }

    if (!req.currentUser?.id) {
      return next(httpError(403, 'Sessao sem contexto de clinica.'))
    }

    return next()
  }

  function getAuditActor(req) {
    if (req.user?.impersonatedBySupport || req.user?.support) {
      return {
        actorUserId: null,
        actorEmail: req.user.supportEmail || req.user.email || config.supportAdminEmail || null,
        actorRole: 'SUPPORT',
      }
    }

    return {
      actorUserId: req.currentUser?.id || req.user?.id || null,
      actorEmail: req.currentUser?.email || req.user?.email || null,
      actorRole: req.currentUser?.role || req.user?.role || null,
    }
  }

  return {
    authMiddleware,
    requireSupport,
    requireScopedClinicUser,
    login,
    serializeUser: user => serializeUser(user, { config }),
    serializeUserWithContext: (user, supportContext = null) => serializeUser(user, { config, supportContext }),
    serializeSupportUser,
    getSupportContact: () => getSupportContact(config),
    getSupportBillingSnapshot,
    getBillingSnapshot,
    getAuditActor,
  }
}

module.exports = {
  createAuthToolkit,
  mergeLegacyUserAggregate,
  buildClinicAggregateSeed,
  getBillingSnapshot,
  getSupportBillingSnapshot,
  serializeUser,
}
