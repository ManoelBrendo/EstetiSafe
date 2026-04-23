const { httpError } = require('../lib/http')

function buildLockError(record) {
  return httpError(423, 'Prontuario bloqueado apos confirmacao de pagamento.', {
    medicalRecordId: record.id,
    lockedAt: record.lockedAt || null,
  })
}

async function loadMedicalRecordOrThrow(db, medicalRecordId) {
  const record = await db.medicalRecord.findUnique({
    where: { id: medicalRecordId },
    include: { client: true },
  })

  if (!record) {
    throw httpError(404, 'Prontuario nao encontrado.')
  }

  return record
}

async function assertMedicalRecordEditable(db, medicalRecordId) {
  const record = await loadMedicalRecordOrThrow(db, medicalRecordId)

  if (record.isLocked) {
    throw buildLockError(record)
  }

  return record
}

async function assertProtocolEditable(db, protocolId) {
  const protocol = await db.protocol.findUnique({
    where: { id: protocolId },
    include: {
      medicalRecord: true,
    },
  })

  if (!protocol) {
    throw httpError(404, 'Protocolo nao encontrado.')
  }

  if (protocol.medicalRecord?.isLocked) {
    throw buildLockError(protocol.medicalRecord)
  }

  return protocol
}

async function assertAppointmentEditable(db, appointmentId) {
  const appointment = await db.appointment.findUnique({
    where: { id: appointmentId },
    include: {
      client: {
        include: {
          medicalRecord: true,
        },
      },
      protocol: {
        include: {
          medicalRecord: true,
        },
      },
    },
  })

  if (!appointment) {
    throw httpError(404, 'Agendamento nao encontrado.')
  }

  const record = appointment.protocol?.medicalRecord || appointment.client?.medicalRecord || null
  if (record?.isLocked) {
    throw buildLockError(record)
  }

  return appointment
}

async function lockMedicalRecord(db, medicalRecordId, lockedAt = new Date()) {
  return db.medicalRecord.update({
    where: { id: medicalRecordId },
    data: {
      isPaid: true,
      isLocked: true,
      lockedAt,
    },
  })
}

module.exports = {
  assertAppointmentEditable,
  assertMedicalRecordEditable,
  assertProtocolEditable,
  loadMedicalRecordOrThrow,
  lockMedicalRecord,
}
