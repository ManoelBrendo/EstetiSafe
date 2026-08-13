const { publicLeadSchema } = require('./lib/helpers')
const { handle } = require('./lib/middlewares')

function registerLeadRoutes({
  app,
  prisma,
}) {
  app.post('/public/leads', handle(async (req, res) => {
    const data = publicLeadSchema.parse(req.body)

    const lead = await prisma.marketingLead.create({
      data: {
        clinicName: data.clinicName.trim(),
        contactName: data.contactName.trim(),
        email: data.email.toLowerCase(),
        phone: data.phone.trim(),
        city: data.city?.trim() || null,
        teamSize: data.teamSize?.trim() || null,
        mainGoal: data.mainGoal?.trim() || null,
        message: data.message?.trim() || null,
        requestedDemo: data.requestedDemo ?? true,
        source: data.source?.trim() || null,
      },
    })

    res.status(201).json({
      ok: true,
      leadId: lead.id,
      message: 'Recebemos seu interesse e vamos retornar com uma apresentaçao em breve.',
    })
  }))
}

module.exports = {
  registerLeadRoutes,
}
