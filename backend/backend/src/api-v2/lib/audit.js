const { signAuditLog } = require('./auditChaining')

async function createAuditLog(prisma, req, auth, entry) {
  const actor = auth.getAuditActor(req)
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

  const signed = await signAuditLog(prisma, payload)

  return prisma.auditLog.create({
    data: signed,
  })
}

module.exports = {
  createAuditLog,
}
