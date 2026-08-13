const test = require('node:test')
const assert = require('node:assert/strict')
const {
  upsertAppointmentPayment,
  updatePayment
} = require('../src/api-v2/lib/payments')

test('api-v2 payments business logic', async (t) => {
  await t.test('upsertAppointmentPayment - PAID locks the client', async () => {
    const db = {
      appointmentUpdated: false,
      clientUpdated: false,
      clientData: null,
    }

    const mockPrisma = {
      $transaction: async (cb) => {
        const tx = {
          appointment: {
            findFirstOrThrow: async () => ({
              id: 3,
              userId: 1,
              client: { id: 9, isLocked: false, isPaid: false }
            }),
            update: async ({ where, data }) => {
              db.appointmentUpdated = true
            }
          },
          client: {
            update: async ({ where, data }) => {
              db.clientUpdated = true
              db.clientData = data
            }
          },
          payment: {
            upsert: async () => ({
              id: 100,
              appointmentId: 3,
              status: 'PAID',
              paidAt: new Date()
            }),
            findUniqueOrThrow: async () => ({
              id: 100,
              appointmentId: 3,
              appointment: {
                client: { id: 9 }
              }
            })
          }
        }
        return cb(tx)
      }
    }

    await upsertAppointmentPayment(mockPrisma, 1, {
      appointmentId: 3,
      amount: 150,
      method: 'PIX',
      status: 'PAID'
    })

    assert.equal(db.appointmentUpdated, true)
    assert.equal(db.clientUpdated, true)
    assert.equal(db.clientData.isLocked, true)
    assert.equal(db.clientData.isPaid, true)
  })

  await t.test('upsertAppointmentPayment - status other than PAID unlocks if no other paid payments exist', async () => {
    const db = {
      clientUpdated: false,
      clientData: null,
    }

    const mockPrisma = {
      $transaction: async (cb) => {
        const tx = {
          appointment: {
            findFirstOrThrow: async () => ({
              id: 3,
              userId: 1,
              client: { id: 9, isLocked: true, isPaid: true }
            }),
            update: async () => {}
          },
          client: {
            update: async ({ where, data }) => {
              db.clientUpdated = true
              db.clientData = data
            }
          },
          payment: {
            upsert: async () => ({
              id: 100,
              appointmentId: 3,
              status: 'PENDING',
              paidAt: null
            }),
            findFirst: async () => null,
            findUniqueOrThrow: async () => ({
              id: 100,
              appointmentId: 3,
              appointment: {
                client: { id: 9 }
              }
            })
          }
        }
        return cb(tx)
      }
    }

    await upsertAppointmentPayment(mockPrisma, 1, {
      appointmentId: 3,
      amount: 150,
      method: 'PIX',
      status: 'PENDING'
    })

    assert.equal(db.clientUpdated, true)
    assert.equal(db.clientData.isLocked, false)
    assert.equal(db.clientData.isPaid, false)
    assert.equal(db.clientData.lockedAt, null)
  })

  await t.test('updatePayment - status other than PAID unlocks if no other paid payments exist', async () => {
    const db = {
      clientUpdated: false,
      clientData: null,
    }

    const mockPrisma = {
      $transaction: async (cb) => {
        const tx = {
          appointment: {
            update: async () => {}
          },
          client: {
            update: async ({ where, data }) => {
              db.clientUpdated = true
              db.clientData = data
            }
          },
          payment: {
            findFirstOrThrow: async () => ({
              id: 100,
              appointmentId: 3,
              appointment: {
                client: { id: 9 }
              }
            }),
            update: async () => ({
              id: 100,
              status: 'CANCELLED',
              paidAt: null
            }),
            findFirst: async () => null,
            findUniqueOrThrow: async () => ({
              id: 100,
              appointmentId: 3,
              appointment: {
                client: { id: 9 }
              }
            })
          }
        }
        return cb(tx)
      }
    }

    await updatePayment(mockPrisma, 1, 100, {
      status: 'CANCELLED'
    })

    assert.equal(db.clientUpdated, true)
    assert.equal(db.clientData.isLocked, false)
    assert.equal(db.clientData.isPaid, false)
  })
})
