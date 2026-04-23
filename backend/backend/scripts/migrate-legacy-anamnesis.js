require('dotenv').config()
const { PrismaClient } = require('@prisma/client')

const prisma = new PrismaClient()

function digitsOnly(value) {
  return String(value || '').replace(/\D/g, '')
}

function safeText(value) {
  return typeof value === 'string' ? value.trim() : ''
}

function safeBoolean(value) {
  return Boolean(value)
}

function normalizeDateOnly(value) {
  if (!value) return ''

  const asString = String(value)
  if (/^\d{4}-\d{2}-\d{2}$/.test(asString)) {
    return asString
  }

  const parsed = new Date(value)
  if (Number.isNaN(parsed.getTime())) return ''

  return parsed.toISOString().slice(0, 10)
}

function todayDateInput() {
  return new Date().toISOString().slice(0, 10)
}

function calculateAgeFromBirthDate(value) {
  const birthDate = normalizeDateOnly(value)
  if (!birthDate) return ''

  const parsed = new Date(`${birthDate}T12:00:00.000Z`)
  if (Number.isNaN(parsed.getTime())) return ''

  const today = new Date()
  let age = today.getUTCFullYear() - parsed.getUTCFullYear()
  const monthDiff = today.getUTCMonth() - parsed.getUTCMonth()

  if (monthDiff < 0 || (monthDiff === 0 && today.getUTCDate() < parsed.getUTCDate())) {
    age -= 1
  }

  return age >= 0 ? age : ''
}

function normalizeLegacyPhotos(photos) {
  if (!Array.isArray(photos)) return []

  return photos
    .filter(photo => photo && photo.dataUrl)
    .map((photo, index) => ({
      id: photo.id || `legacy-photo-${index + 1}`,
      caption: safeText(photo.caption),
      dataUrl: photo.dataUrl,
    }))
}

function isStructuredAnamnesis(answers) {
  return Boolean(
    answers &&
    typeof answers === 'object' &&
    answers.identification &&
    answers.chiefComplaint &&
    answers.healthHistory &&
    answers.signatures
  )
}

function buildCombinedText(...values) {
  return values
    .map(safeText)
    .filter(Boolean)
    .join('\n\n')
}

function createAestheticHistoryEntries(answers) {
  const procedureName = safeText(answers.proceduresHistory)
  const procedureDate = safeText(answers.lastProcedureDate || answers.procedureDate)
  const notes = buildCombinedText(answers.currentRoutine, answers.previousTreatment)
  const intercurrences = safeText(answers.adverseReactions || answers.intercurrences)

  if (!procedureName && !procedureDate && !notes && !intercurrences) {
    return []
  }

  return [
    {
      id: 'legacy-aesthetic-history-1',
      procedureName: procedureName || 'Procedimento estético anterior',
      procedureDate,
      notes,
      intercurrences,
    },
  ]
}

function createAestheticConditions(answers) {
  const sourceText = [
    safeText(answers.skinProfile),
    safeText(answers.mainComplaint),
    safeText(answers.objective),
    safeText(answers.observations),
  ].join(' ').toLowerCase()

  const definitions = [
    { type: 'acne', label: 'Acne', keywords: ['acne', 'comed', 'espinha'] },
    { type: 'melasma', label: 'Melasma', keywords: ['melasma'] },
    { type: 'spots', label: 'Manchas', keywords: ['mancha', 'pigment'] },
    { type: 'scars', label: 'Cicatrizes', keywords: ['cicatriz'] },
    { type: 'wrinkles', label: 'Rugas', keywords: ['ruga', 'linhas finas'] },
    { type: 'sagging', label: 'Flacidez', keywords: ['flacidez'] },
    { type: 'cellulite', label: 'Celulite', keywords: ['celulite'] },
    { type: 'stretchMarks', label: 'Estrias', keywords: ['estria'] },
    { type: 'localizedFat', label: 'Gordura localizada', keywords: ['gordura localizada'] },
  ]

  return definitions
    .filter(definition => definition.keywords.some(keyword => sourceText.includes(keyword)))
    .map(definition => ({
      type: definition.type,
      label: definition.label,
      present: true,
      classification: '',
      notes: safeText(answers.observations),
    }))
}

function createTreatmentServices(answers) {
  const recommendedProcedure = safeText(answers.recommendedProcedure)
  const objective = safeText(answers.objective || answers.goals)

  if (!recommendedProcedure && !objective) {
    return []
  }

  return [
    {
      id: 'legacy-treatment-service-1',
      name: recommendedProcedure || 'Protocolo estético recomendado',
      sessions: 1,
      description: buildCombinedText(answers.cadence, answers.productsUsed, answers.equipmentsUsed),
      adverseEffects: safeText(answers.adverseEffects) || 'Efeitos adversos não informados no registro legado.',
    },
  ]
}

function buildStructuredAnswers(record, client) {
  const answers = record && record.answers && typeof record.answers === 'object'
    ? record.answers
    : {}

  const birthDate = normalizeDateOnly(client.birthDate)
  const signedAt = normalizeDateOnly(record.filledAt || record.updatedAt) || todayDateInput()
  const currentDiscomfort = safeText(answers.mainComplaint || answers.objective || answers.restrictions)
  const desiredProcedure = safeText(answers.desiredProcedure || answers.goals || answers.objective)

  return {
    identification: {
      fullName: safeText(client.name),
      cpf: digitsOnly(client.cpf),
      birthDate,
      age: calculateAgeFromBirthDate(birthDate),
      sex: safeText(client.sex),
      maritalStatus: safeText(client.maritalStatus),
      profession: safeText(client.profession),
      phone: safeText(client.phone),
      email: safeText(client.email),
      addressFull: safeText(client.addressFull),
    },
    chiefComplaint: {
      desiredProcedure,
      currentDiscomfort,
      complaintDuration: safeText(answers.complaintDuration),
      previousTreatment: buildCombinedText(answers.proceduresHistory, answers.currentRoutine, answers.previousTreatment),
    },
    healthHistory: {
      preExistingConditions: {
        hypertension: false,
        diabetes: false,
        heartDisease: false,
        autoimmuneDisease: false,
        hormonalIssues: false,
        kidneyIssues: false,
        liverIssues: false,
        otherConditions: buildCombinedText(answers.healthConditions, answers.healthHistory),
      },
      surgeries: {
        hadSurgeries: Boolean(safeText(answers.surgeries)),
        surgeryDetails: safeText(answers.surgeries),
        approximateDate: safeText(answers.surgeryDate),
        hadComplications: false,
      },
      medications: {
        continuousMedication: Boolean(safeText(answers.currentMedications)),
        medicationDetails: safeText(answers.currentMedications),
        anticoagulants: false,
        corticosteroids: false,
        recentAntibiotics: false,
      },
      allergies: {
        hasAllergies: Boolean(safeText(answers.allergies)),
        medicationAllergy: false,
        cosmeticsAllergy: false,
        anestheticsAllergy: false,
        notes: safeText(answers.allergies),
      },
      dermatologicalHistory: {
        activeAcne: false,
        rosacea: false,
        melasma: false,
        skinSensitivity: /sens/i.test(safeText(answers.skinProfile)) || /sens/i.test(safeText(answers.observations)),
        keloidTendency: false,
      },
      aestheticHistory: createAestheticHistoryEntries(answers),
    },
    lifestyle: {
      smoking: false,
      alcoholConsumption: false,
      alcoholFrequency: '',
      dailyWaterIntake: '',
      diet: '',
      physicalActivity: false,
      workoutsPerWeek: null,
      sleepQuality: '',
    },
    aestheticEvaluation: {
      skinType: '',
      fitzpatrick: '',
      conditions: createAestheticConditions(answers),
      observedConditions: {
        wrinkles: false,
        sagging: false,
        spots: false,
        scars: false,
        localizedFat: false,
        cellulite: false,
        stretchMarks: false,
      },
    },
    contraindications: {
      pregnancy: false,
      lactation: false,
      activeInfections: false,
      recentIsotretinoin: false,
      activeDermatologicalDiseases: false,
      metallicImplants: false,
      additionalNotes: buildCombinedText(answers.contraindications, answers.restrictions, answers.observations),
    },
    expectations: {
      treatmentExpectations: safeText(answers.objective || answers.goals),
      expectedResultTimeline: '',
      awareOfLimitations: false,
    },
    treatmentObjective: safeText(answers.objective || answers.goals),
    photoRecord: {
      photos: normalizeLegacyPhotos(answers.photos),
      imageUseAuthorized: safeBoolean(answers.imageUseAuthorized),
    },
    treatmentPlan: {
      recommendedProcedure: safeText(answers.recommendedProcedure),
      sessionCount: null,
      sessionInterval: safeText(answers.cadence),
      productsUsed: safeText(answers.productsUsed),
      equipmentsUsed: safeText(answers.equipmentsUsed),
      services: createTreatmentServices(answers),
    },
    scienceTerm: {
      informedHistoryAccurately: false,
      awareOfRisks: false,
      receivedPreAndPostGuidance: false,
    },
    signatures: {
      patientSignatureDataUrl: safeText(answers.patientSignatureDataUrl),
      professionalSignatureDataUrl: safeText(answers.professionalSignatureDataUrl),
      professionalName: safeText(answers.professionalName) || 'Profissional não informado',
      signedAt,
    },
  }
}

async function main() {
  const dryRun = process.argv.includes('--dry-run')

  const records = await prisma.anamnesis.findMany({
    include: {
      client: {
        select: {
          id: true,
          name: true,
          cpf: true,
          birthDate: true,
          sex: true,
          maritalStatus: true,
          profession: true,
          phone: true,
          email: true,
          addressFull: true,
        },
      },
    },
    orderBy: { id: 'asc' },
  })

  let migrated = 0
  let skipped = 0

  for (const record of records) {
    if (isStructuredAnamnesis(record.answers)) {
      skipped += 1
      continue
    }

    const nextAnswers = buildStructuredAnswers(record, record.client || {})

    if (!dryRun) {
      await prisma.anamnesis.update({
        where: { id: record.id },
        data: { answers: nextAnswers },
      })
    }

    migrated += 1
  }

  console.log(JSON.stringify({
    mode: dryRun ? 'dry-run' : 'write',
    total: records.length,
    migrated,
    skipped,
  }, null, 2))
}

main()
  .catch(error => {
    console.error(error)
    process.exitCode = 1
  })
  .finally(async () => {
    await prisma.$disconnect()
  })
