const crypto = require('crypto')

function computeLogSignature(entry, previousHash) {
  const payload = JSON.stringify({
    clinicId: entry.clinicId || null,
    actorUserId: entry.actorUserId || null,
    actorEmail: entry.actorEmail || null,
    actorRole: entry.actorRole || null,
    action: entry.action,
    entityType: entry.entityType,
    entityId: entry.entityId === null || entry.entityId === undefined ? null : String(entry.entityId),
    previousHash: previousHash || 'SEED_HASH_INIT',
  })

  return crypto.createHmac('sha256', process.env.JWT_SECRET || 'fallback-secret-for-logs')
    .update(payload)
    .digest('hex')
}

async function getPreviousLogHash(prisma) {
  if (!prisma || !prisma.auditLog || typeof prisma.auditLog.findFirst !== 'function') {
    return null
  }

  try {
    const lastLog = await prisma.auditLog.findFirst({
      orderBy: { id: 'desc' },
    })

    if (lastLog && lastLog.metadata && typeof lastLog.metadata === 'object') {
      return lastLog.metadata.hash || null
    }
  } catch (err) {
    return null
  }
  return null
}

async function signAuditLog(prisma, data) {
  const previousHash = await getPreviousLogHash(prisma)
  const hash = computeLogSignature(data, previousHash)

  const originalMetadata = data.metadata || {}
  const metadata = {
    ...originalMetadata,
    hash,
    previousHash: previousHash || 'SEED_HASH_INIT',
  }

  return {
    ...data,
    metadata,
  }
}

async function verifyAuditLogChain(prisma) {
  const logs = await prisma.auditLog.findMany({
    orderBy: { id: 'asc' },
  })

  let previousHash = 'SEED_HASH_INIT'
  const anomalies = []

  for (const log of logs) {
    const meta = log.metadata || {}
    const storedHash = meta.hash
    const storedPreviousHash = meta.previousHash

    if (!storedHash || !storedPreviousHash) {
      anomalies.push({
        id: log.id,
        action: log.action,
        error: 'Chaves de assinatura ausentes no metadata',
      })
      continue
    }

    const computedHash = computeLogSignature({
      clinicId: log.clinicId,
      actorUserId: log.actorUserId,
      actorEmail: log.actorEmail,
      actorRole: log.actorRole,
      action: log.action,
      entityType: log.entityType,
      entityId: log.entityId,
    }, storedPreviousHash)

    if (computedHash !== storedHash) {
      anomalies.push({
        id: log.id,
        action: log.action,
        error: 'Assinatura inválida (conteúdo do log adulterado)',
      })
    }

    if (storedPreviousHash !== previousHash) {
      anomalies.push({
        id: log.id,
        action: log.action,
        error: `Cadeia quebrada: hash anterior esperado ${previousHash}, mas o registro possui ${storedPreviousHash}`,
      })
    }

    previousHash = storedHash
  }

  return {
    verified: anomalies.length === 0,
    totalLogs: logs.length,
    anomalies,
  }
}

module.exports = {
  computeLogSignature,
  getPreviousLogHash,
  signAuditLog,
  verifyAuditLogChain,
}
