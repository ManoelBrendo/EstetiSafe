const bcrypt = require('bcryptjs')
const crypto = require('crypto')
const {
  ensureClinicAggregate,
  createAuditLog,
  createAuditLogFromRequest,
  signToken,
  signRefreshToken,
  registerSchema,
  loginSchema,
  clinicProfileSchema,
  createSupportLoginResponse,
  SUPPORT_ADMIN_EMAIL,
  SUPPORT_ADMIN_PASSWORD,
  SUPPORT_ADMIN_NAME,
  SUPPORT_CONTACT_NAME,
  SUPPORT_CONTACT_EMAIL,
  SUPPORT_CONTACT_PHONE,
  serializeSupportUser,
  serializeUser,
  getRequestClinicId,
  addDays,
} = require('./lib/helpers')
const { authMiddleware, handle } = require('./lib/middlewares')
const { safeEqualText } = require('../../lib/security')

function registerAuthRoutes({
  app,
  prisma,
}) {
  function setXsrfCookie(res) {
    const token = crypto.randomBytes(24).toString('hex')
    res.cookie('XSRF-TOKEN', token, {
      httpOnly: false,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      path: '/'
    })
  }

  app.post('/auth/register', handle(async (req, res) => {
    const data = registerSchema.parse(req.body)
    const email = data.email.toLowerCase()
    const existing = await prisma.user.findUnique({ where: { email } })

    if (existing) {
      return res.status(409).json({ error: 'E-mail ja cadastrado.' })
    }

    const hashedPassword = await bcrypt.hash(data.password, 12)
    const createdUser = await prisma.user.create({
      data: {
        email,
        hashedPassword,
        clinicName: data.clinicName,
        billingStatus: 'TRIAL',
        billingGraceEndsAt: addDays(new Date(), 7),
      },
    })

    const user = await ensureClinicAggregate(createdUser.id)

    await createAuditLog({
      clinicId: user.ownedClinic?.id || null,
      actorUserId: user.id,
      actorEmail: user.email,
      actorRole: user.role,
      action: 'AUTH_REGISTER',
      entityType: 'Clinic',
      entityId: user.ownedClinic?.id || null,
      metadata: {
        email: user.email,
        clinicName: user.clinicName,
      },
    })

    const token = signToken({ id: user.id, email: user.email, role: user.role })
    const refreshToken = signRefreshToken({ id: user.id, email: user.email, role: user.role })

    res.cookie('refreshToken', refreshToken, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'strict',
      path: '/auth',
      maxAge: 7 * 24 * 60 * 60 * 1000,
    })

    setXsrfCookie(res)
    res.status(201).json({
      token,
      user: serializeUser(user),
    })
  }))

  app.post('/auth/login', handle(async (req, res) => {
    const data = loginSchema.parse(req.body)
    const email = data.email.toLowerCase()
    const supportLoginResponse = createSupportLoginResponse({
      email,
      password: data.password,
      supportAdminEmail: SUPPORT_ADMIN_EMAIL,
      supportAdminPassword: SUPPORT_ADMIN_PASSWORD,
      supportAdminName: SUPPORT_ADMIN_NAME,
      safeEqualText,
      signToken,
      serializeSupportUser,
    })

    if (supportLoginResponse) {
      if (supportLoginResponse.status === 200) {
        setXsrfCookie(res)
        const supportPayload = {
          support: true,
          role: 'SUPPORT',
          email: SUPPORT_ADMIN_EMAIL,
          supportName: SUPPORT_ADMIN_NAME,
        }
        const refreshToken = signRefreshToken(supportPayload)
        res.cookie('refreshToken', refreshToken, {
          httpOnly: true,
          secure: process.env.NODE_ENV === 'production',
          sameSite: 'strict',
          path: '/auth',
          maxAge: 7 * 24 * 60 * 60 * 1000,
        })
      }
      return res.status(supportLoginResponse.status).json(supportLoginResponse.body)
    }

    const userRecord = await prisma.user.findUnique({ where: { email } })

    if (!userRecord) {
      return res.status(404).json({ error: 'Nenhuma conta encontrada para este e-mail.' })
    }

    const passwordMatches = await bcrypt.compare(data.password, userRecord.hashedPassword)
    if (!passwordMatches) {
      return res.status(401).json({ error: 'Credenciais invalidas.' })
    }

    const user = await ensureClinicAggregate(userRecord.id)
    const token = signToken({ id: user.id, email: user.email, role: user.role })
    const refreshToken = signRefreshToken({ id: user.id, email: user.email, role: user.role })

    res.cookie('refreshToken', refreshToken, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'strict',
      path: '/auth',
      maxAge: 7 * 24 * 60 * 60 * 1000,
    })

    setXsrfCookie(res)
    res.json({
      token,
      user: serializeUser(user),
    })
  }))

  app.post('/auth/logout', handle(async (req, res) => {
    res.clearCookie('refreshToken', {
      path: '/auth',
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'strict',
    })
    res.json({ success: true })
  }))

  app.post('/auth/refresh', handle(async (req, res) => {
    const refreshToken = req.cookies.refreshToken
    if (!refreshToken) {
      return res.status(401).json({ error: 'Refresh token ausente.' })
    }

    let payload
    try {
      const jwt = require('jsonwebtoken')
      payload = jwt.verify(refreshToken, process.env.JWT_SECRET || 'dev_jwt_secret_change_in_production')
    } catch {
      return res.status(401).json({ error: 'Refresh token invalido ou expirado.' })
    }

    const newAccessToken = signToken({
      id: payload.id,
      email: payload.email,
      role: payload.role,
      support: payload.support,
      supportName: payload.supportName,
    })

    res.json({ token: newAccessToken })
  }))

  app.get('/auth/me', authMiddleware, handle(async (req, res) => {
    setXsrfCookie(res)
    if (req.user?.support) {
      return res.json(serializeSupportUser())
    }

    res.json(serializeUser(req.currentUser, { supportContext: req.supportContext }))
  }))

  app.get('/clinic/profile', authMiddleware, handle(async (req, res) => {
    res.json(serializeUser(req.currentUser, { supportContext: req.supportContext }))
  }))

  app.put('/clinic/profile', authMiddleware, handle(async (req, res) => {
    const data = clinicProfileSchema.parse(req.body)

    await prisma.$transaction(async tx => {
      const nextClinicName = Object.prototype.hasOwnProperty.call(data, 'clinicName')
        ? (data.clinicName?.trim() || req.currentUser.clinicName)
        : req.currentUser.clinicName
      const nextLogo = Object.prototype.hasOwnProperty.call(data, 'clinicLogoDataUrl')
        ? (data.clinicLogoDataUrl?.trim() || null)
        : (req.currentUser.clinicLogoDataUrl || null)
      const nextOperationalScopes = Object.prototype.hasOwnProperty.call(data, 'clinicOperationalScopes')
        ? data.clinicOperationalScopes
        : (Array.isArray(req.currentUser.clinicOperationalScopes) ? req.currentUser.clinicOperationalScopes : [])

      await tx.user.update({
        where: { id: req.currentUser.id },
        data: {
          clinicName: nextClinicName,
          clinicLogoDataUrl: nextLogo,
          clinicOperationalScopes: nextOperationalScopes,
        },
      })

      if (req.currentUser.ownedClinic?.id) {
        await tx.clinic.update({
          where: { id: req.currentUser.ownedClinic.id },
          data: {
            name: nextClinicName,
            logoDataUrl: nextLogo,
          },
        })
      }
    })

    await createAuditLogFromRequest(req, {
      clinicId: getRequestClinicId(req),
      action: 'CLINIC_PROFILE_UPDATED',
      entityType: 'Clinic',
      entityId: getRequestClinicId(req) ? String(getRequestClinicId(req)) : null,
      metadata: {
        changedFields: Object.keys(data),
        clinicNameChanged: Object.prototype.hasOwnProperty.call(data, 'clinicName'),
        logoChanged: Object.prototype.hasOwnProperty.call(data, 'clinicLogoDataUrl'),
        operationalScopesChanged: Object.prototype.hasOwnProperty.call(data, 'clinicOperationalScopes'),
        sensitivePayloadStored: false,
      },
    })

    const user = await ensureClinicAggregate(req.currentUser.id)

    res.json(serializeUser(user, { supportContext: req.supportContext }))
  }))
}

module.exports = {
  registerAuthRoutes,
}
