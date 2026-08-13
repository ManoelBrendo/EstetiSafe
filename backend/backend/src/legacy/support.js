const { z } = require('zod')
const {
  buildSupportUser,
  getSupportBillingSnapshot,
  getSupportContact,
  hasSupportCredentials,
  isSupportPayload,
  createSupportLoginResponse,
  ensureClinicAggregate,
  userAggregateInclude,
  mergeLegacyUserAggregate,
  serializeUser,
  createAuditLogFromRequest,
  signToken,
} = require('./lib/helpers')
const {
  authMiddleware,
  handle,
  requireSupport,
} = require('./lib/middlewares')

const supportAssumeSchema = z.object({ userId: z.coerce.number().int().positive() })

function registerSupportRoutes({
  app,
  prisma,
  supportAdminEmail = process.env.SUPPORT_ADMIN_EMAIL || '',
  supportAdminName = process.env.SUPPORT_ADMIN_NAME || 'Central de suporte',
  supportContactName = process.env.SUPPORT_CONTACT_NAME || "Suporte L'Appui",
  supportContactEmail = process.env.SUPPORT_CONTACT_EMAIL || '',
  supportContactPhone = process.env.SUPPORT_CONTACT_PHONE || '',
}) {
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
