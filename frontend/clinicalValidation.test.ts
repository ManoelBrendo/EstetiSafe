import { describe, it, expect } from 'vitest'
import { validateClinicalReadiness } from './clinicalValidation'
import type { ClientRecord } from './clinicalTypes'

// Helper para criar mock de cliente
function createMockClient(overrides: Partial<ClientRecord> = {}): ClientRecord {
  return {
    id: 1,
    fullName: 'Maria da Silva',
    name: 'Maria',
    isLocked: false,
    latestAnamnesis: null,
    latestConsentRecord: null,
    latestAppointment: null,
    appointments: [],
    consentRecords: [],
    anamneses: [],
    payments: [],
    isPaid: true,
    lockedAt: null,
    lockMessage: null,
    readOnly: false,
    allowedActions: {
      view: true,
      downloadPdf: true,
      editAnamnesis: true,
      editProtocols: true,
      editEvaluations: true,
      editRecommendations: true,
    },
    prontuarioStatus: {
      isPaid: true,
      isLocked: false,
      lockedAt: null,
      lockMessage: null,
      readOnly: false,
      allowedActions: {
        view: true,
        downloadPdf: true,
        editAnamnesis: true,
        editProtocols: true,
        editEvaluations: true,
        editRecommendations: true,
      },
    },
    ...overrides,
  }
}

// Helper para mock de anamnese básica
const mockBasicAnamnesis = {
  identification: {
    fullName: 'Maria da Silva',
    cpf: '123.456.789-00',
    birthDate: '1990-01-01',
    age: '36',
    sex: 'Feminino',
    maritalStatus: 'Solteira',
    profession: 'Designer',
    phone: '(11) 99999-9999',
    email: 'maria@example.com',
    addressFull: 'Rua A, 123',
  },
  chiefComplaint: {
    desiredProcedure: 'Limpeza de pele',
    currentDiscomfort: 'Oleosidade',
    complaintDuration: 'Meses',
    previousTreatment: 'Nenhum',
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
      otherConditions: '',
    },
    surgeries: {
      hadSurgeries: false,
      surgeryDetails: '',
      approximateDate: '',
      hadComplications: false,
    },
    medications: {
      continuousMedication: false,
      medicationDetails: '',
      anticoagulants: false,
      corticosteroids: false,
      recentAntibiotics: false,
    },
    allergies: {
      hasAllergies: false,
      medicationAllergy: false,
      cosmeticsAllergy: false,
      anestheticsAllergy: false,
      notes: '',
    },
    dermatologicalHistory: {
      activeAcne: false,
      Rosacea: false,
      rosacea: false,
      melasma: false,
      skinSensitivity: false,
      keloidTendency: false,
    },
    aestheticHistory: [],
  },
  lifestyle: {
    smoking: false,
    alcoholConsumption: false,
    alcoholFrequency: '',
    dailyWaterIntake: '2L',
    diet: 'Equilibrada',
    physicalActivity: false,
    workoutsPerWeek: '0',
    sleepQuality: 'Boa',
  },
  aestheticEvaluation: {
    skinType: 'Mista',
    fitzpatrick: 'II',
    conditions: [],
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
    additionalNotes: '',
  },
  expectations: {
    treatmentExpectations: 'Melhorar textura',
    expectedResultTimeline: 'Imediato',
    awareOfLimitations: true,
  },
  treatmentObjective: 'Estético',
  photoRecord: {
    photos: [],
    imageUseAuthorized: true,
    clinicalUseAuthorized: true,
    marketingUseAuthorized: false,
    consentVersion: '1.0',
    consentAcceptedAt: '2026-06-13T10:00:00Z',
    consentAwarenessConfirmed: true,
  },
  treatmentPlan: {
    recommendedProcedure: 'Limpeza de pele',
    sessionCount: 1,
    sessionInterval: '30 dias',
    productsUsed: 'Sabonete neutro',
    equipmentsUsed: 'Alta frequência',
    services: [],
  },
  scienceTerm: {
    informedHistoryAccurately: true,
    awareOfRisks: true,
    receivedPreAndPostGuidance: true,
  },
  signatures: {
    patientSignatureDataUrl: 'data:image/png;base64,mock',
    professionalSignatureDataUrl: 'data:image/png;base64,mock',
    professionalId: 10,
    professionalName: 'Dr. Esteta',
    signedAt: '2026-06-13T10:00:00Z',
  },
}

describe('validateClinicalReadiness', () => {
  it('should fail when patient record is locked', () => {
    const client = createMockClient({ isLocked: true })
    const result = validateClinicalReadiness(client, { name: 'Peeling Químico' })
    expect(result.ready).toBe(false)
    expect(result.severity).toBe('error')
    expect(result.message).toContain('bloqueado')
  })

  it('should fail when anamnesis is missing', () => {
    const client = createMockClient({ latestAnamnesis: null, anamneses: [] })
    const result = validateClinicalReadiness(client, { name: 'Peeling Químico' })
    expect(result.ready).toBe(false)
    expect(result.severity).toBe('error')
    expect(result.message).toContain('Anamnese obrigatória')
  })

  it('should fail when consent record is missing for a critical service', () => {
    const client = createMockClient({
      latestAnamnesis: mockBasicAnamnesis,
      consentRecords: [],
    })
    const result = validateClinicalReadiness(client, { name: 'Toxina Botulínica', isCritical: true })
    expect(result.ready).toBe(false)
    expect(result.severity).toBe('warning')
    expect(result.message).toContain('Termo de consentimento pendente')
  })

  it('should pass when consent record is signed for a critical service', () => {
    const client = createMockClient({
      latestAnamnesis: mockBasicAnamnesis,
      consentRecords: [{ id: 1, title: 'Termo Toxina', status: 'SIGNED', createdAt: '2026-06-12', signedAt: '2026-06-12' }],
    })
    const result = validateClinicalReadiness(client, { name: 'Toxina Botulínica', isCritical: true })
    expect(result.ready).toBe(true)
    expect(result.severity).toBe('success')
  })

  it('should raise warning when client has allergies recorded', () => {
    const allergyAnamnesis = {
      ...mockBasicAnamnesis,
      healthHistory: {
        ...mockBasicAnamnesis.healthHistory,
        allergies: {
          hasAllergies: true,
          medicationAllergy: true,
          cosmeticsAllergy: false,
          anestheticsAllergy: false,
          notes: 'Alergia a AAS',
        },
      },
    }
    const client = createMockClient({ latestAnamnesis: allergyAnamnesis })
    const result = validateClinicalReadiness(client, { name: 'Peeling Químico' })
    expect(result.ready).toBe(true)
    expect(result.severity).toBe('warning')
    expect(result.message).toContain('Paciente com alergias ou condições preexistentes')
    expect(result.details).toContain('Paciente possui histórico de alergias registrado.')
  })

  it('should raise warning when client has pre-existing conditions recorded', () => {
    const conditionAnamnesis = {
      ...mockBasicAnamnesis,
      healthHistory: {
        ...mockBasicAnamnesis.healthHistory,
        preExistingConditions: {
          ...mockBasicAnamnesis.healthHistory.preExistingConditions,
          autoimmuneDisease: true,
          hypertension: true,
        },
      },
    }
    const client = createMockClient({ latestAnamnesis: conditionAnamnesis })
    const result = validateClinicalReadiness(client, { name: 'Peeling Químico' })
    expect(result.ready).toBe(true)
    expect(result.severity).toBe('warning')
    expect(result.details).toContain('Paciente possui doença autoimune registrada.')
    expect(result.details).toContain('Paciente possui hipertensão registrada.')
  })

  it('should pass cleanly for a healthy patient with complete records', () => {
    const client = createMockClient({ latestAnamnesis: mockBasicAnamnesis })
    const result = validateClinicalReadiness(client, { name: 'Limpeza Simples' })
    expect(result.ready).toBe(true)
    expect(result.severity).toBe('success')
    expect(result.details).toContain('Nenhum impedimento clínico detectado.')
  })

  it('should raise warning for Preenchimento Labial if herpes history is present', () => {
    const herpesAnamnesis = {
      ...mockBasicAnamnesis,
      healthHistory: {
        ...mockBasicAnamnesis.healthHistory,
        preExistingConditions: {
          ...mockBasicAnamnesis.healthHistory.preExistingConditions,
          otherConditions: 'Possui herpes labial recorrente',
        },
      },
    }
    const client = createMockClient({ latestAnamnesis: herpesAnamnesis })
    const result = validateClinicalReadiness(client, { name: 'Preenchimento Labial' })
    expect(result.ready).toBe(true)
    expect(result.severity).toBe('warning')
    expect(result.message).toContain('Contraindicações ou riscos identificados')
    expect(result.details).toContain('Preenchimento Labial: Paciente possui histórico ou risco de herpes simples ativo. Recomenda-se profilaxia antiviral.')
  })

  it('should raise warning for Preenchimento Labial if anesthetic allergy is present', () => {
    const allergyAnamnesis = {
      ...mockBasicAnamnesis,
      healthHistory: {
        ...mockBasicAnamnesis.healthHistory,
        allergies: {
          ...mockBasicAnamnesis.healthHistory.allergies,
          anestheticsAllergy: true,
        },
      },
    }
    const client = createMockClient({ latestAnamnesis: allergyAnamnesis })
    const result = validateClinicalReadiness(client, { name: 'Lip Filler' })
    expect(result.ready).toBe(true)
    expect(result.severity).toBe('warning')
    expect(result.details).toContain('Preenchimento Labial: Alerta de sensibilidade a anestésicos locais.')
  })

  it('should raise warning for Bioestimuladores de Colágeno if autoimmune disease is present', () => {
    const autoAnamnesis = {
      ...mockBasicAnamnesis,
      healthHistory: {
        ...mockBasicAnamnesis.healthHistory,
        preExistingConditions: {
          ...mockBasicAnamnesis.healthHistory.preExistingConditions,
          autoimmuneDisease: true,
        },
      },
    }
    const client = createMockClient({ latestAnamnesis: autoAnamnesis })
    const result = validateClinicalReadiness(client, { name: 'Bioestimulador de Colágeno' })
    expect(result.ready).toBe(true)
    expect(result.severity).toBe('warning')
    expect(result.details).toContain('Bioestimulador de Colágeno: Contraindicação relativa para pacientes com doença autoimune ativa (risco de formação de nódulos).')
  })

  it('should raise warning for Bioestimuladores de Colágeno if keloid tendency is present', () => {
    const keloidAnamnesis = {
      ...mockBasicAnamnesis,
      healthHistory: {
        ...mockBasicAnamnesis.healthHistory,
        dermatologicalHistory: {
          ...mockBasicAnamnesis.healthHistory.dermatologicalHistory,
          keloidTendency: true,
        },
      },
    }
    const client = createMockClient({ latestAnamnesis: keloidAnamnesis })
    const result = validateClinicalReadiness(client, { name: 'Biostimulator Application' })
    expect(result.ready).toBe(true)
    expect(result.severity).toBe('warning')
    expect(result.details).toContain('Bioestimulador de Colágeno: Paciente com tendência a queloides. Recomenda-se cautela na aplicação.')
  })

  it('should raise warning for Fios de Sustentação if patient uses anticoagulants', () => {
    const bloodAnamnesis = {
      ...mockBasicAnamnesis,
      healthHistory: {
        ...mockBasicAnamnesis.healthHistory,
        medications: {
          ...mockBasicAnamnesis.healthHistory.medications,
          anticoagulants: true,
        },
      },
    }
    const client = createMockClient({ latestAnamnesis: bloodAnamnesis })
    const result = validateClinicalReadiness(client, { name: 'Fios de Sustentação de PDO' })
    expect(result.ready).toBe(true)
    expect(result.severity).toBe('warning')
    expect(result.details).toContain('Fios de Sustentação: Uso de anticoagulantes relatado. Alto risco de hematomas e sangramento.')
  })
})
