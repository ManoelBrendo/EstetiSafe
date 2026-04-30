const { z } = require('zod')

const supportAssumeSchema = z.object({ userId: z.coerce.number().int().positive() })

function hasSupportCredentials({ supportAdminEmail, supportAdminPassword }) {
  return Boolean(supportAdminEmail && supportAdminPassword)
}

function getSupportContact({
  supportContactName,
  supportContactEmail,
  supportContactPhone,
}) {
  return {
    name: supportContactName,
    email: supportContactEmail,
    phone: supportContactPhone,
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
    message: 'Acesso técnico liberado para manutenção, diagnóstico e suporte.',
  }
}

function buildSupportUser({
  supportAdminEmail,
  supportAdminName,
}) {
  return {
    id: 0,
    email: supportAdminEmail,
    clinicName: supportAdminName,
    clinicLogoDataUrl: null,
    role: 'SUPPORT',
    createdAt: new Date(0),
  }
}

function isSupportPayload(payload, supportAdminEmail) {
  return Boolean(payload?.support === true && payload?.role === 'SUPPORT' && payload?.email === supportAdminEmail)
}

function requireSupport(req, res, next) {
  if (!req.user?.support) {
    return res.status(403).json({ error: 'Acesso restrito ao suporte técnico.' })
  }

  next()
}

function createSupportLoginResponse({
  email,
  password,
  supportAdminEmail,
  supportAdminPassword,
  supportAdminName,
  safeEqualText,
  signToken,
  serializeSupportUser,
}) {
  if (!hasSupportCredentials({ supportAdminEmail, supportAdminPassword }) || email !== supportAdminEmail) {
    return null
  }

  const passwordMatches = safeEqualText(password, supportAdminPassword)

  if (!passwordMatches) {
    return {
      status: 401,
      body: { error: 'Credenciais invalidas.' },
    }
  }

  const token = signToken({
    support: true,
    role: 'SUPPORT',
    email: supportAdminEmail,
    supportName: supportAdminName,
  })

  return {
    status: 200,
    body: {
      token,
      user: serializeSupportUser(),
    },
  }
}

function registerSupportRoutes({
  app,
  prisma,
  authMiddleware,
  handle,
  requireSupport,
  ensureClinicAggregate,
  userAggregateInclude,
  mergeLegacyUserAggregate,
  serializeUser,
  createAuditLogFromRequest,
  signToken,
  supportAdminEmail,
  supportAdminName,
  supportContactName,
  supportContactEmail,
  supportContactPhone,
}) {
  const requiredDeps = {
    app,
    prisma,
    authMiddleware,
    handle,
    requireSupport,
    ensureClinicAggregate,
    userAggregateInclude,
    mergeLegacyUserAggregate,
    serializeUser,
    createAuditLogFromRequest,
    signToken,
    supportAdminEmail,
    supportAdminName,
    supportContactName,
    supportContactEmail,
  }

  for (const [key, value] of Object.entries(requiredDeps)) {
    if (!value) {
      throw new Error(`registerSupportRoutes requer ${key}`)
    }
  }

  app.get('/public/support-contact', (req, res) => {
    res.json(getSupportContact({
      supportContactName,
      supportContactEmail,
      supportContactPhone,
    }))
  })

  app.get('/support/clinics', authMiddleware, requireSupport, handle(async (req, res) => {
    const clinicUsers = await prisma.user.findMany({
      where: {
        role: {
          in: ['ADMIN', 'STAFF'],
        },
      },
      orderBy: [{ clinicName: 'asc' }],
      include: userAggregateInclude,
    })

    const clinics = clinicUsers.map(user => serializeUser(mergeLegacyUserAggregate(user)))

    res.json({
      totalClinics: clinics.length,
      blockedCount: clinics.filter(item => item.billing?.effectiveStatus === 'BLOCKED').length,
      overdueCount: clinics.filter(item => item.billing?.effectiveStatus === 'OVERDUE').length,
      clinics,
    })
  }))

  app.post('/support/assume', authMiddleware, requireSupport, handle(async (req, res) => {
    const { userId } = supportAssumeSchema.parse(req.body)
    const clinicUser = await ensureClinicAggregate(userId)

    const supportContext = {
      active: true,
      supportEmail: supportAdminEmail,
      supportName: supportAdminName,
    }

    await createAuditLogFromRequest(req, {
      clinicId: clinicUser.ownedClinic?.id || null,
      action: 'SUPPORT_ASSUME_CLINIC',
      entityType: 'Clinic',
      entityId: clinicUser.ownedClinic?.id || null,
      metadata: {
        userId: clinicUser.id,
        clinicEmail: clinicUser.email,
      },
    })

    const token = signToken({
      id: clinicUser.id,
      email: clinicUser.email,
      role: clinicUser.role,
      impersonatedBySupport: true,
      supportEmail: supportAdminEmail,
      supportName: supportAdminName,
    })

    res.json({
      token,
      user: serializeUser(clinicUser, { supportContext }),
    })
  }))
}

module.exports = {
  buildSupportUser,
  createSupportLoginResponse,
  getSupportBillingSnapshot,
  getSupportContact,
  hasSupportCredentials,
  isSupportPayload,
  registerSupportRoutes,
  requireSupport,
}
