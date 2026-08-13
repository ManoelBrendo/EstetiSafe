const test = require('node:test')
const assert = require('node:assert/strict')
const crypto = require('crypto')
const {
  computeLogSignature,
  signAuditLog,
  verifyAuditLogChain
} = require('../src/api-v2/lib/auditChaining')

test('Cryptographic Audit Log Chaining', async (t) => {
  const originalSecret = process.env.JWT_SECRET
  process.env.JWT_SECRET = 'test-secret-long-enough-for-encryption-and-hashing-purposes'

  t.after(() => {
    process.env.JWT_SECRET = originalSecret
  })

  await t.test('should calculate valid linked signatures', async () => {
    const db = []
    const mockPrisma = {
      auditLog: {
        findFirst: async () => {
          return db[db.length - 1] || null
        },
        findMany: async () => {
          return db
        }
      }
    }

    const log1 = {
      clinicId: 1,
      actorUserId: 10,
      actorEmail: 'admin@test.com',
      actorRole: 'ADMIN',
      action: 'CLIENT_CREATE',
      entityType: 'Client',
      entityId: '123',
    }

    const signed1 = await signAuditLog(mockPrisma, log1)
    assert.ok(signed1.metadata.hash)
    assert.equal(signed1.metadata.previousHash, 'SEED_HASH_INIT')

    db.push({ id: 1, ...signed1 })

    const log2 = {
      clinicId: 1,
      actorUserId: 10,
      actorEmail: 'admin@test.com',
      actorRole: 'ADMIN',
      action: 'CLIENT_UPDATE',
      entityType: 'Client',
      entityId: '123',
    }

    const signed2 = await signAuditLog(mockPrisma, log2)
    assert.ok(signed2.metadata.hash)
    assert.equal(signed2.metadata.previousHash, signed1.metadata.hash)

    db.push({ id: 2, ...signed2 })

    const verifyResult = await verifyAuditLogChain(mockPrisma)
    assert.equal(verifyResult.verified, true)
    assert.equal(verifyResult.totalLogs, 2)
    assert.equal(verifyResult.anomalies.length, 0)
  })

  await t.test('should detect tampering in log content', async () => {
    const db = []
    const mockPrisma = {
      auditLog: {
        findFirst: async () => db[db.length - 1] || null,
        findMany: async () => db
      }
    }

    const signed1 = await signAuditLog(mockPrisma, { action: 'A', entityType: 'X', entityId: '1' })
    db.push({ id: 1, ...signed1 })

    const signed2 = await signAuditLog(mockPrisma, { action: 'B', entityType: 'Y', entityId: '2' })
    db.push({ id: 2, ...signed2 })

    db[0].action = 'MALICIOUS_CHANGED_ACTION'

    const verifyResult = await verifyAuditLogChain(mockPrisma)
    assert.equal(verifyResult.verified, false)
    assert.ok(verifyResult.anomalies.some(a => a.error.includes('Assinatura inválida')))
  })

  await t.test('should detect deletion of log entries', async () => {
    const db = []
    const mockPrisma = {
      auditLog: {
        findFirst: async () => db[db.length - 1] || null,
        findMany: async () => db
      }
    }

    const signed1 = await signAuditLog(mockPrisma, { action: 'A', entityType: 'X', entityId: '1' })
    db.push({ id: 1, ...signed1 })

    const signed2 = await signAuditLog(mockPrisma, { action: 'B', entityType: 'Y', entityId: '2' })
    db.push({ id: 2, ...signed2 })

    const signed3 = await signAuditLog(mockPrisma, { action: 'C', entityType: 'Z', entityId: '3' })
    db.push({ id: 3, ...signed3 })

    db.splice(1, 1)

    const verifyResult = await verifyAuditLogChain(mockPrisma)
    assert.equal(verifyResult.verified, false)
    assert.ok(verifyResult.anomalies.some(a => a.error.includes('Cadeia quebrada')))
  })
})
