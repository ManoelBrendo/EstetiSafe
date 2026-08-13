const { signAuditLog } = require('./auditChaining')

class AuditService {
  constructor(prisma, auth) {
    this.prisma = prisma
    this.auth = auth
  }

  async log(req, entry) {
    const actor = this.auth.getAuditActor(req)
    const payload = {
      clinicId: req.currentUser?.ownedClinic?.id || null,
      actorUserId: actor.actorUserId,
      actorEmail: actor.actorEmail,
      actorRole: actor.actorRole,
      action: entry.action,
      entityType: entry.entityType,
      entityId: entry.entityId === null || entry.entityId === undefined ? null : String(entry.entityId),
      metadata: entry.metadata ?? null,
    }

    const signed = await signAuditLog(this.prisma, payload)

    return this.prisma.auditLog.create({
      data: signed,
    })
  }
}

module.exports = {
  AuditService,
}
