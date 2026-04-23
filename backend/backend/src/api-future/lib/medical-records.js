const { httpError, pickDefined, parseUuid } = require('./http')

const futureMedicalRecordInclude = {
  client: true,
  anamnesis: {
    include: {
      aestheticHistory: true,
    },
  },
  aestheticEvaluations: true,
  protocols: {
    include: {
      services: {
        include: {
          service: true,
        },
      },
    },
  },
  payments: true,
  pdfDocuments: true,
}

function parseOptionalDate(value) {
  if (!value) return undefined

  const parsed = new Date(value)
  if (Number.isNaN(parsed.getTime())) {
    throw httpError(422, 'Data invalida')
  }

  return parsed
}

async function getMedicalRecordById(prisma, medicalRecordId) {
  const record = await prisma.medicalRecord.findUnique({
    where: {
      id: parseUuid(medicalRecordId, 'medicalRecordId'),
    },
    include: futureMedicalRecordInclude,
  })

  if (!record) {
    throw httpError(404, 'Prontuario nao encontrado')
  }

  return record
}

async function getOrCreateMedicalRecordForClient(prisma, clientId) {
  const normalizedClientId = parseUuid(clientId, 'clientId')
  const client = await prisma.client.findUnique({
    where: { id: normalizedClientId },
  })

  if (!client) {
    throw httpError(404, 'Cliente nao encontrado')
  }

  const existing = await prisma.medicalRecord.findUnique({
    where: {
      clientId: normalizedClientId,
    },
  })

  if (!existing) {
    const created = await prisma.medicalRecord.create({
      data: {
        clientId: normalizedClientId,
      },
    })

    return getMedicalRecordById(prisma, created.id)
  }

  return getMedicalRecordById(prisma, existing.id)
}

function assertMedicalRecordEditable(medicalRecord) {
  if (medicalRecord?.isLocked) {
    throw httpError(423, 'Prontuario bloqueado apos confirmacao de pagamento')
  }
}

async function upsertAnamnesis(prisma, medicalRecordId, payload) {
  const normalizedMedicalRecordId = parseUuid(medicalRecordId, 'medicalRecordId')

  return prisma.$transaction(async tx => {
    const anamnesis = await tx.anamnesis.upsert({
      where: {
        medicalRecordId: normalizedMedicalRecordId,
      },
      update: pickDefined({
        chiefComplaint: payload.chiefComplaint,
        expectations: payload.expectations,
        treatmentObjective: payload.treatmentObjective,
        workoutsPerWeek: payload.workoutsPerWeek,
        smoking: payload.smoking,
        alcoholUse: payload.alcoholUse,
        waterIntakeLiters: payload.waterIntakeLiters,
        sleepQuality: payload.sleepQuality,
        allergies: payload.allergies,
        medications: payload.medications,
        diseases: payload.diseases,
        surgeries: payload.surgeries,
        pregnancyStatus: payload.pregnancyStatus,
      }),
      create: pickDefined({
        medicalRecordId: normalizedMedicalRecordId,
        chiefComplaint: payload.chiefComplaint,
        expectations: payload.expectations,
        treatmentObjective: payload.treatmentObjective,
        workoutsPerWeek: payload.workoutsPerWeek,
        smoking: payload.smoking,
        alcoholUse: payload.alcoholUse,
        waterIntakeLiters: payload.waterIntakeLiters,
        sleepQuality: payload.sleepQuality,
        allergies: payload.allergies,
        medications: payload.medications,
        diseases: payload.diseases,
        surgeries: payload.surgeries,
        pregnancyStatus: payload.pregnancyStatus,
      }),
    })

    await tx.aestheticHistory.deleteMany({
      where: {
        anamnesisId: anamnesis.id,
      },
    })

    if (payload.aestheticHistory?.length) {
      await tx.aestheticHistory.createMany({
        data: payload.aestheticHistory.map(entry => ({
          anamnesisId: anamnesis.id,
          procedureName: entry.procedureName,
          procedureDate: parseOptionalDate(entry.procedureDate),
          notes: entry.notes || null,
          complications: entry.complications || null,
        })),
      })
    }

    return tx.medicalRecord.findUnique({
      where: {
        id: normalizedMedicalRecordId,
      },
      include: futureMedicalRecordInclude,
    })
  })
}

async function replaceAestheticEvaluations(prisma, medicalRecordId, evaluations) {
  const normalizedMedicalRecordId = parseUuid(medicalRecordId, 'medicalRecordId')

  return prisma.$transaction(async tx => {
    await tx.aestheticEvaluation.deleteMany({
      where: {
        medicalRecordId: normalizedMedicalRecordId,
      },
    })

    if (evaluations?.length) {
      await tx.aestheticEvaluation.createMany({
        data: evaluations.map(item => ({
          medicalRecordId: normalizedMedicalRecordId,
          evaluationType: item.evaluationType,
          classification: item.classification || null,
          intensity: item.intensity || null,
          level: item.level || null,
          notes: item.notes || null,
        })),
      })
    }

    return tx.medicalRecord.findUnique({
      where: {
        id: normalizedMedicalRecordId,
      },
      include: futureMedicalRecordInclude,
    })
  })
}

async function lockMedicalRecord(prisma, medicalRecordId, lockedAt = new Date()) {
  return prisma.medicalRecord.update({
    where: {
      id: parseUuid(medicalRecordId, 'medicalRecordId'),
    },
    data: {
      isPaid: true,
      isLocked: true,
      lockedAt,
    },
    include: futureMedicalRecordInclude,
  })
}

async function unlockMedicalRecord(prisma, medicalRecordId) {
  return prisma.medicalRecord.update({
    where: {
      id: parseUuid(medicalRecordId, 'medicalRecordId'),
    },
    data: {
      isLocked: false,
      lockedAt: null,
    },
    include: futureMedicalRecordInclude,
  })
}

module.exports = {
  futureMedicalRecordInclude,
  parseOptionalDate,
  getMedicalRecordById,
  getOrCreateMedicalRecordForClient,
  assertMedicalRecordEditable,
  upsertAnamnesis,
  replaceAestheticEvaluations,
  lockMedicalRecord,
  unlockMedicalRecord,
}
