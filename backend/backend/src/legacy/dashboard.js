const { buildDocumentDashboard } = require('./documents')
const { buildInventoryDashboard } = require('./inventory')
const { buildClinicalInsights } = require('./clinicalInsights')
const {
  startOfMonth,
  startOfNextMonth,
} = require('./lib/helpers')
const { authMiddleware, handle } = require('./lib/middlewares')

function registerLegacyDashboardRoutes({
  app,
  prisma,
}) {
  app.get('/dashboard', authMiddleware, handle(async (req, res) => {
    const now = new Date()
    const monthStart = startOfMonth(now)
    const nextMonthStart = startOfNextMonth(now)

    const [totalClients, totalAppointments, revenue, upcoming, documents, products, equipmentItems, latestAnamnesis] = await Promise.all([
      prisma.client.count({ where: { userId: req.user.id } }),
      prisma.appointment.count({
        where: { userId: req.user.id, startAt: { gte: monthStart, lt: nextMonthStart }, status: 'COMPLETED' },
      }),
      prisma.payment.aggregate({
        _sum: { amount: true },
        where: {
          status: 'PAID',
          appointment: { userId: req.user.id, startAt: { gte: monthStart, lt: nextMonthStart } },
        },
      }),
      prisma.appointment.findMany({
        where: {
          userId: req.user.id,
          startAt: { gte: now },
          status: { in: ['SCHEDULED', 'CONFIRMED', 'IN_PROGRESS'] },
        },
        include: {
          client: { select: { name: true } },
          service: { select: { name: true } },
        },
        orderBy: { startAt: 'asc' },
        take: 5,
      }),
      prisma.clinicDocument.findMany({
        where: { userId: req.user.id },
        select: {
          id: true,
          category: true,
          documentType: true,
          title: true,
          notes: true,
          expiresAt: true,
          fileName: true,
          fileMimeType: true,
          createdAt: true,
          updatedAt: true,
        },
      }),
      prisma.productItem.findMany({
        where: { userId: req.user.id, active: true },
      }),
      prisma.equipmentItem.findMany({
        where: { userId: req.user.id, active: true },
      }),
      prisma.anamnesis.findFirst({
        where: { client: { userId: req.user.id } },
        orderBy: { updatedAt: 'desc' },
        select: { id: true, answers: true, updatedAt: true },
      }),
    ])

    const documentDashboard = buildDocumentDashboard(documents, {
      operationalScopes: req.currentUser?.clinicOperationalScopes,
    })
    const inventoryDashboard = buildInventoryDashboard(products, equipmentItems)
    const clinicalInsights = buildClinicalInsights({
      now,
      products,
      equipmentItems,
      anamnesis: latestAnamnesis,
    })

    res.json({
      month: { totalClients, totalAppointments, revenue: revenue._sum.amount ?? 0 },
      upcoming,
      documents: documentDashboard,
      inventory: inventoryDashboard,
      clinicalInsights,
      billing: req.billing,
    })
  }))
}

module.exports = {
  registerLegacyDashboardRoutes,
}
