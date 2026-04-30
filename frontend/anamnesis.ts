import type {
  AnamnesisForm,
  AnamnesisPayload,
  AnamnesisRecordInput,
  AnamnesisRecordVersion,
  AestheticCondition,
  AestheticConditionMeta,
  AestheticHistoryEntry,
  ClientSeed,
  DermatologicalHistoryKey,
  DermatologicalHistorySection,
  FieldDefinition,
  ObservedConditionKey,
  ObservedConditionsSection,
  PreExistingConditionKey,
  SelectOption,
  TreatmentService,
} from './clinicalTypes'

type UnknownRecord = Record<string, unknown>
type MutableUnknownRecord = Record<string | number, unknown>
export const ANAMNESIS_SEX_OPTIONS: SelectOption[] = [
  { value: 'FEMININO', label: 'Feminino' },
  { value: 'MASCULINO', label: 'Masculino' },
  { value: 'NAO_BINARIO', label: 'Não binário' },
  { value: 'PREFIRO_NAO_INFORMAR', label: 'Prefiro não informar' },
  { value: 'OUTRO', label: 'Outro' },
]

export const ANAMNESIS_MARITAL_STATUS_OPTIONS: SelectOption[] = [
  { value: 'SOLTEIRO', label: 'Solteiro(a)' },
  { value: 'CASADO', label: 'Casado(a)' },
  { value: 'DIVORCIADO', label: 'Divorciado(a)' },
  { value: 'VIUVO', label: 'Viúvo(a)' },
  { value: 'UNIAO_ESTAVEL', label: 'União estável' },
  { value: 'OUTRO', label: 'Outro' },
]

export const ANAMNESIS_ALCOHOL_FREQUENCY_OPTIONS: SelectOption[] = [
  { value: 'NAO_CONSOME', label: 'Não consome' },
  { value: 'SOCIAL', label: 'Socialmente' },
  { value: 'SEMANAL', label: 'Semanalmente' },
  { value: 'FREQUENTE', label: 'Com frequência' },
]

export const ANAMNESIS_SLEEP_QUALITY_OPTIONS: SelectOption[] = [
  { value: 'OTIMA', label: 'Ótima' },
  { value: 'BOA', label: 'Boa' },
  { value: 'REGULAR', label: 'Regular' },
  { value: 'RUIM', label: 'Ruim' },
]

export const ANAMNESIS_SKIN_TYPE_OPTIONS: SelectOption[] = [
  { value: 'OLEOSA', label: 'Oleosa' },
  { value: 'SECA', label: 'Seca' },
  { value: 'MISTA', label: 'Mista' },
  { value: 'NORMAL', label: 'Normal' },
]

export const ANAMNESIS_FITZPATRICK_OPTIONS: SelectOption[] = [
  { value: 'I', label: 'I' },
  { value: 'II', label: 'II' },
  { value: 'III', label: 'III' },
  { value: 'IV', label: 'IV' },
  { value: 'V', label: 'V' },
  { value: 'VI', label: 'VI' },
]

export const WORKOUTS_PER_WEEK_OPTIONS: SelectOption[] = Array.from({ length: 8 }, (_, index) => ({
  value: String(index),
  label: index === 0 ? 'Não pratica' : `${index}x por semana`,
}))

export const PRE_EXISTING_CONDITION_FIELDS: FieldDefinition<PreExistingConditionKey>[] = [
  { key: 'hypertension', label: 'Hipertensão' },
  { key: 'diabetes', label: 'Diabetes' },
  { key: 'heartDisease', label: 'Doenças cardíacas' },
  { key: 'autoimmuneDisease', label: 'Doenças autoimunes' },
  { key: 'hormonalIssues', label: 'Problemas hormonais' },
  { key: 'kidneyIssues', label: 'Problemas renais' },
  { key: 'liverIssues', label: 'Problemas hepáticos' },
]

export const DERMATOLOGICAL_HISTORY_FIELDS: FieldDefinition<DermatologicalHistoryKey>[] = [
  { key: 'activeAcne', label: 'Acne ativa' },
  { key: 'rosacea', label: 'Rosácea' },
  { key: 'melasma', label: 'Melasma' },
  { key: 'skinSensitivity', label: 'Sensibilidade cutânea' },
  { key: 'keloidTendency', label: 'Tendência a queloide' },
]

export const AESTHETIC_OBSERVATION_FIELDS: FieldDefinition[] = [
  { key: 'wrinkles', label: 'Rugas' },
  { key: 'sagging', label: 'Flacidez' },
  { key: 'spots', label: 'Manchas' },
  { key: 'scars', label: 'Cicatrizes' },
  { key: 'localizedFat', label: 'Gordura localizada' },
  { key: 'cellulite', label: 'Celulite' },
  { key: 'stretchMarks', label: 'Estrias' },
]

export const AESTHETIC_CONDITION_LIBRARY: AestheticConditionMeta[] = [
  {
    type: 'acne',
    label: 'Acne',
    classificationLabel: 'Grau',
    classificationOptions: ['Grau I', 'Grau II', 'Grau III', 'Grau IV'],
  },
  {
    type: 'melasma',
    label: 'Melasma',
    classificationLabel: 'Intensidade',
    classificationOptions: ['Leve', 'Moderado', 'Intenso'],
  },
  {
    type: 'wrinkles',
    label: 'Rugas',
    classificationLabel: 'Nível',
    classificationOptions: ['Leve', 'Moderado', 'Avançado'],
  },
  {
    type: 'sagging',
    label: 'Flacidez',
    classificationLabel: 'Nível',
    classificationOptions: ['Leve', 'Moderada', 'Acentuada'],
  },
  {
    type: 'spots',
    label: 'Manchas',
    classificationLabel: 'Intensidade',
    classificationOptions: ['Leve', 'Moderada', 'Intensa'],
  },
  {
    type: 'scars',
    label: 'Cicatrizes',
    classificationLabel: 'Nível',
    classificationOptions: ['Superficial', 'Moderada', 'Profunda'],
  },
  {
    type: 'localizedFat',
    label: 'Gordura localizada',
    classificationLabel: 'Nível',
    classificationOptions: ['Leve', 'Moderada', 'Acentuada'],
  },
  {
    type: 'cellulite',
    label: 'Celulite',
    classificationLabel: 'Grau',
    classificationOptions: ['Grau I', 'Grau II', 'Grau III', 'Grau IV'],
  },
  {
    type: 'stretchMarks',
    label: 'Estrias',
    classificationLabel: 'Nível',
    classificationOptions: ['Recente', 'Moderada', 'Instalada'],
  },
]

const OBSERVED_CONDITION_TYPE_MAP: Record<ObservedConditionKey, AestheticCondition['type']> = {
  wrinkles: 'wrinkles',
  sagging: 'sagging',
  spots: 'spots',
  scars: 'scars',
  localizedFat: 'localizedFat',
  cellulite: 'cellulite',
  stretchMarks: 'stretchMarks',
}

const CONDITION_LABEL_BY_TYPE: Record<string, string> = Object.fromEntries(
  AESTHETIC_CONDITION_LIBRARY.map(condition => [condition.type, condition.label])
)

function digitsOnly(value: unknown): string {
  return String(value || '').replace(/\D/g, '')
}

function createLocalId(prefix: string): string {
  return `${prefix}-${Date.now()}-${Math.random().toString(16).slice(2, 8)}`
}

export const PHOTO_CONSENT_VERSION = 'photo-consent-v1'

export function todayDateInput(): string {
  return new Date().toISOString().slice(0, 10)
}

export function normalizeDateInput(value: unknown): string {
  if (!value) return ''
  const asString = String(value)
  return asString.length >= 10 ? asString.slice(0, 10) : asString
}

export function applyDateInputMask(value: unknown): string {
  const digits = digitsOnly(value).slice(0, 8)

  if (digits.length <= 2) return digits
  if (digits.length <= 4) return digits.slice(0, 2) + '/' + digits.slice(2)

  return digits.slice(0, 2) + '/' + digits.slice(2, 4) + '/' + digits.slice(4)
}

export function formatDateInputDisplay(value: unknown): string {
  const normalized = normalizeDateInput(value)
  if (!normalized) return ''

  const [year, month, day] = normalized.split('-')
  if (year?.length === 4 && month?.length === 2 && day?.length === 2) {
    return day + '/' + month + '/' + year
  }

  return applyDateInputMask(normalized)
}

export function parseDateInputDisplay(value: unknown): string {
  if (!value) return ''

  const masked = applyDateInputMask(value)
  if (masked.length !== 10) return ''

  const [day, month, year] = masked.split('/')
  const parsedDate = new Date(Date.UTC(Number(year), Number(month) - 1, Number(day)))

  if (Number.isNaN(parsedDate.getTime())) return ''
  if (parsedDate.getUTCFullYear() !== Number(year)) return ''
  if (parsedDate.getUTCMonth() !== Number(month) - 1) return ''
  if (parsedDate.getUTCDate() !== Number(day)) return ''

  return year + '-' + month + '-' + day
}

export function calculateAgeFromBirthDate(value: unknown): string {
  if (!value) return ''

  const birthDate = new Date(normalizeDateInput(value) + 'T12:00:00.000Z')
  if (Number.isNaN(birthDate.getTime())) return ''

  const today = new Date()
  let age = today.getUTCFullYear() - birthDate.getUTCFullYear()
  const monthDiff = today.getUTCMonth() - birthDate.getUTCMonth()

  if (monthDiff < 0 || (monthDiff === 0 && today.getUTCDate() < birthDate.getUTCDate())) {
    age -= 1
  }

  return age >= 0 ? String(age) : ''
}

function safeText(value: unknown): string {
  return typeof value === 'string' ? value : ''
}

function safeBoolean(value: unknown): boolean {
  return Boolean(value)
}

function safePositiveInteger(value: unknown): number | null {
  const parsedValue = Number(value)
  return Number.isInteger(parsedValue) && parsedValue > 0 ? parsedValue : null
}

function safeNonNegativeInteger(value: unknown): number | null {
  if (value === '' || value === null || value === undefined) return null

  const parsedValue = Number(value)
  return Number.isInteger(parsedValue) && parsedValue >= 0 ? parsedValue : null
}

function safeSessionCount(value: unknown): number {
  const parsedValue = Number(value)
  return Number.isInteger(parsedValue) && parsedValue > 0 ? parsedValue : 1
}

function mapLegacySkinType(value: unknown): string {
  const normalized = safeText(value).trim().toUpperCase()

  if (normalized.includes('OLEOS')) return 'OLEOSA'
  if (normalized.includes('SECA')) return 'SECA'
  if (normalized.includes('MISTA')) return 'MISTA'
  if (normalized.includes('NORMAL')) return 'NORMAL'

  return ''
}

function isPlainRecord(value: unknown): value is UnknownRecord {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value)
}

function deepMerge<T>(target: T, source: unknown): T & UnknownRecord {
  if (Array.isArray(target)) {
    return (Array.isArray(source) ? source : target) as T & UnknownRecord
  }

  if (!isPlainRecord(target)) {
    return (source ?? target) as T & UnknownRecord
  }

  if (!isPlainRecord(source)) {
    return target as T & UnknownRecord
  }

  const result: UnknownRecord = { ...target }

  Object.keys(source).forEach(key => {
    const currentValue = target[key as keyof T]
    const nextValue = source[key]

    if (Array.isArray(currentValue)) {
      result[key] = Array.isArray(nextValue) ? nextValue : currentValue
      return
    }

    if (isPlainRecord(currentValue) && isPlainRecord(nextValue)) {
      result[key] = deepMerge(currentValue, nextValue)
      return
    }

    result[key] = nextValue ?? currentValue
  })

  return result as T & UnknownRecord
}

function buildLegacyObservedConditions(legacyObservedConditions: Partial<ObservedConditionsSection> = {}): ObservedConditionsSection {
  return {
    wrinkles: safeBoolean(legacyObservedConditions.wrinkles),
    sagging: safeBoolean(legacyObservedConditions.sagging),
    spots: safeBoolean(legacyObservedConditions.spots),
    scars: safeBoolean(legacyObservedConditions.scars),
    localizedFat: safeBoolean(legacyObservedConditions.localizedFat),
    cellulite: safeBoolean(legacyObservedConditions.cellulite),
    stretchMarks: safeBoolean(legacyObservedConditions.stretchMarks),
  }
}

function getConditionMeta(type: string): AestheticConditionMeta {
  return AESTHETIC_CONDITION_LIBRARY.find(condition => condition.type === type) || {
    type,
    label: CONDITION_LABEL_BY_TYPE[type] || type,
    classificationLabel: 'Classificação',
    classificationOptions: ['Leve', 'Moderado', 'Intenso'],
  }
}

export function createEmptyAestheticCondition(partial: Partial<AestheticCondition> = {}): AestheticCondition {
  const meta = getConditionMeta(partial.type || 'custom')

  return {
    type: partial.type || meta.type,
    label: safeText(partial.label || meta.label),
    present: safeBoolean(partial.present),
    classification: safeText(partial.classification),
    notes: safeText(partial.notes),
  }
}

export function createEmptyAestheticHistoryEntry(partial: Partial<AestheticHistoryEntry> = {}): AestheticHistoryEntry {
  return {
    id: safeText(partial.id) || createLocalId('aesthetic-history'),
    procedureName: safeText(partial.procedureName),
    procedureDate: safeText(partial.procedureDate),
    notes: safeText(partial.notes),
    intercurrences: safeText(partial.intercurrences),
  }
}

export function createEmptyTreatmentService(partial: Partial<TreatmentService> = {}): TreatmentService {
  return {
    id: safeText(partial.id) || createLocalId('treatment-service'),
    name: safeText(partial.name),
    sessions: safeSessionCount(partial.sessions || 1),
    description: safeText(partial.description),
    adverseEffects: safeText(partial.adverseEffects),
  }
}

function deriveLegacyAestheticHistoryEntries(legacyAestheticHistory: UnknownRecord = {}): AestheticHistoryEntry[] {
  if (!legacyAestheticHistory || typeof legacyAestheticHistory !== 'object') {
    return []
  }

  const procedureName = safeText(legacyAestheticHistory.procedureDetails)
  const procedureDate = safeText(legacyAestheticHistory.lastProcedureDate)
  const adverseReaction = safeBoolean(legacyAestheticHistory.adverseReaction)
  const hadAestheticProcedures = safeBoolean(legacyAestheticHistory.hadAestheticProcedures)

  if (!procedureName && !procedureDate && !adverseReaction && !hadAestheticProcedures) {
    return []
  }

  return [
    createEmptyAestheticHistoryEntry({
      id: 'legacy-aesthetic-history-1',
      procedureName: procedureName || 'Procedimento estético anterior',
      procedureDate,
      notes: hadAestheticProcedures ? 'Paciente relata histórico de procedimentos estéticos anteriores.' : '',
      intercurrences: adverseReaction ? 'Paciente informou reação adversa em procedimento anterior.' : '',
    }),
  ]
}

function normalizeAestheticHistoryEntries(entries: Array<Partial<AestheticHistoryEntry>> = [], legacyAestheticHistory: UnknownRecord = {}): AestheticHistoryEntry[] {
  const source = Array.isArray(entries) && entries.length
    ? entries
    : deriveLegacyAestheticHistoryEntries(legacyAestheticHistory)

  return source
    .map(entry => createEmptyAestheticHistoryEntry(entry))
    .filter(entry => entry.procedureName || entry.procedureDate || entry.notes || entry.intercurrences)
}

function normalizeAestheticConditions(conditions: Array<Partial<AestheticCondition>> = [], legacyObservedConditions: Partial<ObservedConditionsSection> = {}, dermatologicalHistory: Partial<DermatologicalHistorySection> = {}): AestheticCondition[] {
  const normalizedObserved = buildLegacyObservedConditions(legacyObservedConditions)
  const sourceMap = new Map<string, AestheticCondition>()

  if (Array.isArray(conditions)) {
    conditions.forEach(condition => {
      const type = safeText(condition?.type).trim()
      if (!type) return
      sourceMap.set(type, createEmptyAestheticCondition(condition))
    })
  }

  const getObservedPresence = (type: string) => {
    if (!Object.prototype.hasOwnProperty.call(normalizedObserved, type)) return false
    return safeBoolean(normalizedObserved[type as ObservedConditionKey])
  }

  const defaultConditions = AESTHETIC_CONDITION_LIBRARY.map(meta => {
    const source = sourceMap.get(meta.type)
    const derivedPresent = source
      ? safeBoolean(source.present)
      : meta.type === 'acne'
        ? safeBoolean(dermatologicalHistory.activeAcne)
        : meta.type === 'melasma'
          ? safeBoolean(dermatologicalHistory.melasma)
          : getObservedPresence(meta.type)

    return createEmptyAestheticCondition({
      type: meta.type,
      label: meta.label,
      present: derivedPresent,
      classification: source?.classification || '',
      notes: source?.notes || '',
    })
  })

  const customConditions = Array.isArray(conditions)
    ? conditions
      .filter(condition => {
        const type = safeText(condition?.type).trim()
        return type && !AESTHETIC_CONDITION_LIBRARY.some(item => item.type === type)
      })
      .map(condition => createEmptyAestheticCondition(condition))
    : []

  return [...defaultConditions, ...customConditions]
}

function buildObservedConditionsFromConditions(conditions: Array<Partial<AestheticCondition>> = []): ObservedConditionsSection {
  const base: ObservedConditionsSection = {
    wrinkles: false,
    sagging: false,
    spots: false,
    scars: false,
    localizedFat: false,
    cellulite: false,
    stretchMarks: false,
  }

  conditions.forEach(condition => {
    const type = safeText(condition?.type)
    const matchedEntry = (Object.entries(OBSERVED_CONDITION_TYPE_MAP) as Array<[ObservedConditionKey, string]>)
      .find(([, mappedType]) => mappedType === type)

    if (matchedEntry) {
      base[matchedEntry[0]] = safeBoolean(condition.present)
    }
  })

  return base
}
function deriveLegacyTreatmentServices(treatmentPlan: UnknownRecord = {}): TreatmentService[] {
  const recommendedProcedure = safeText(treatmentPlan.recommendedProcedure)
  const hasLegacyProtocol = Boolean(
    recommendedProcedure
    || treatmentPlan.sessionCount
    || safeText(treatmentPlan.productsUsed)
    || safeText(treatmentPlan.equipmentsUsed)
    || safeText(treatmentPlan.sessionInterval)
  )

  if (!hasLegacyProtocol) return []

  const descriptionLines = [
    safeText(treatmentPlan.sessionInterval) ? `Intervalo sugerido: ${safeText(treatmentPlan.sessionInterval)}` : '',
    safeText(treatmentPlan.productsUsed) ? `Produtos vinculados ao protocolo: ${safeText(treatmentPlan.productsUsed)}` : '',
    safeText(treatmentPlan.equipmentsUsed) ? `Equipamentos vinculados ao protocolo: ${safeText(treatmentPlan.equipmentsUsed)}` : '',
  ].filter(Boolean)

  return [
    createEmptyTreatmentService({
      id: 'legacy-treatment-service-1',
      name: recommendedProcedure || 'Protocolo principal',
      sessions: safeSessionCount(treatmentPlan.sessionCount || 1),
      description: descriptionLines.join('\n'),
      adverseEffects: '',
    }),
  ]
}

function normalizeTreatmentServices(services: Array<Partial<TreatmentService>> = [], treatmentPlan: UnknownRecord = {}): TreatmentService[] {
  const source = Array.isArray(services) && services.length ? services : deriveLegacyTreatmentServices(treatmentPlan)

  return source
    .map(service => createEmptyTreatmentService(service))
    .filter(service => service.name || service.description || service.adverseEffects)
}

export function createEmptyAnamnesisForm(client: ClientSeed = {}): AnamnesisForm {
  const birthDate = normalizeDateInput(client.birthDate)

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
      desiredProcedure: '',
      currentDiscomfort: '',
      complaintDuration: '',
      previousTreatment: '',
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
      dailyWaterIntake: '',
      diet: '',
      physicalActivity: false,
      workoutsPerWeek: '',
      sleepQuality: '',
    },
    aestheticEvaluation: {
      skinType: '',
      fitzpatrick: '',
      conditions: AESTHETIC_CONDITION_LIBRARY.map(condition => createEmptyAestheticCondition(condition)),
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
      treatmentExpectations: '',
      expectedResultTimeline: '',
      awareOfLimitations: false,
    },
    treatmentObjective: '',
    photoRecord: {
      photos: [],
      imageUseAuthorized: false,
      clinicalUseAuthorized: false,
      marketingUseAuthorized: false,
      consentVersion: PHOTO_CONSENT_VERSION,
      consentAcceptedAt: null,
      consentAwarenessConfirmed: false,
    },
    treatmentPlan: {
      recommendedProcedure: '',
      sessionCount: '',
      sessionInterval: '',
      productsUsed: '',
      equipmentsUsed: '',
      services: [],
    },
    scienceTerm: {
      informedHistoryAccurately: false,
      awareOfRisks: false,
      receivedPreAndPostGuidance: false,
    },
    signatures: {
      patientSignatureDataUrl: '',
      professionalSignatureDataUrl: '',
      professionalId: null,
      professionalName: '',
      signedAt: todayDateInput(),
    },
  }
}

function mapLegacyAnamnesis(answers: UnknownRecord = {}, client: ClientSeed = {}): UnknownRecord {
  const combinedPreviousTreatment = [safeText(answers.proceduresHistory), safeText(answers.currentRoutine)]
    .filter(Boolean)
    .join('\n\n')

  const combinedContraindications = [safeText(answers.contraindications), safeText(answers.observations)]
    .filter(Boolean)
    .join('\n\n')

  return {
    identification: {
      fullName: safeText(client.name),
      cpf: digitsOnly(client.cpf),
      birthDate: normalizeDateInput(client.birthDate),
      age: calculateAgeFromBirthDate(client.birthDate),
      sex: safeText(client.sex),
      maritalStatus: safeText(client.maritalStatus),
      profession: safeText(client.profession),
      phone: safeText(client.phone),
      email: safeText(client.email),
      addressFull: safeText(client.addressFull),
    },
    chiefComplaint: {
      desiredProcedure: safeText(answers.goals),
      currentDiscomfort: safeText(answers.mainComplaint),
      complaintDuration: '',
      previousTreatment: combinedPreviousTreatment,
    },
    healthHistory: {
      preExistingConditions: {
        otherConditions: '',
      },
      surgeries: {},
      medications: {
        continuousMedication: Boolean(safeText(answers.currentMedications)),
        medicationDetails: safeText(answers.currentMedications),
      },
      allergies: {
        hasAllergies: Boolean(safeText(answers.allergies)),
        notes: safeText(answers.allergies),
      },
      dermatologicalHistory: {},
      aestheticHistory: deriveLegacyAestheticHistoryEntries({
        hadAestheticProcedures: Boolean(safeText(answers.proceduresHistory)),
        procedureDetails: safeText(answers.proceduresHistory),
        lastProcedureDate: '',
        adverseReaction: false,
      }),
    },
    lifestyle: {},
    aestheticEvaluation: {
      skinType: mapLegacySkinType(answers.skinProfile),
      fitzpatrick: '',
      conditions: [],
      observedConditions: {},
    },
    contraindications: {
      additionalNotes: combinedContraindications,
    },
    expectations: {
      treatmentExpectations: safeText(answers.goals),
      expectedResultTimeline: '',
      awareOfLimitations: false,
    },
    treatmentObjective: '',
    photoRecord: {
      photos: Array.isArray(answers.photos) ? answers.photos : [],
      imageUseAuthorized: safeBoolean(answers.imageUseAuthorized),
      clinicalUseAuthorized: safeBoolean(answers.clinicalUseAuthorized || answers.imageUseAuthorized),
      marketingUseAuthorized: safeBoolean(answers.marketingUseAuthorized || answers.imageUseAuthorized),
      consentVersion: PHOTO_CONSENT_VERSION,
      consentAcceptedAt: null,
      consentAwarenessConfirmed: safeBoolean(answers.consentAwarenessConfirmed || answers.clinicalUseAuthorized || answers.imageUseAuthorized),
    },
    treatmentPlan: {},
    scienceTerm: {},
    signatures: {
      patientSignatureDataUrl: '',
      professionalSignatureDataUrl: '',
      professionalId: null,
      professionalName: '',
      signedAt: todayDateInput(),
    },
  }
}

export function normalizeAnamnesisRecord(record: AnamnesisRecordInput | AnamnesisRecordVersion | null | undefined, client: ClientSeed = {}): AnamnesisRecordVersion {
  const rawSource = record && 'answers' in record ? record.answers || record || {} : record || {}
  const raw = isPlainRecord(rawSource) ? rawSource : {}
  const structured = isPlainRecord(raw.identification) && isPlainRecord(raw.chiefComplaint)
    ? raw
    : mapLegacyAnamnesis(raw, client)
  const merged = deepMerge(createEmptyAnamnesisForm(client), structured)
  const birthDate = normalizeDateInput(merged.identification.birthDate || client.birthDate)
  const normalizedConditions = normalizeAestheticConditions(
    merged.aestheticEvaluation?.conditions,
    merged.aestheticEvaluation?.observedConditions,
    merged.healthHistory?.dermatologicalHistory
  )

  merged.identification = {
    ...merged.identification,
    fullName: safeText(merged.identification.fullName || client.name),
    cpf: digitsOnly(merged.identification.cpf || client.cpf),
    birthDate,
    age: calculateAgeFromBirthDate(birthDate),
    sex: safeText(merged.identification.sex || client.sex),
    maritalStatus: safeText(merged.identification.maritalStatus || client.maritalStatus),
    profession: safeText(merged.identification.profession || client.profession),
    phone: safeText(merged.identification.phone || client.phone),
    email: safeText(merged.identification.email || client.email),
    addressFull: safeText(merged.identification.addressFull || client.addressFull),
  }

  merged.healthHistory = {
    ...merged.healthHistory,
    aestheticHistory: normalizeAestheticHistoryEntries(
      merged.healthHistory?.aestheticHistory,
      isPlainRecord(merged.aestheticHistory) ? merged.aestheticHistory : {}
    ),
  }

  merged.lifestyle = {
    ...merged.lifestyle,
    workoutsPerWeek: merged.lifestyle?.workoutsPerWeek === null
      ? ''
      : String(merged.lifestyle?.workoutsPerWeek ?? ''),
  }

  merged.aestheticEvaluation = {
    ...merged.aestheticEvaluation,
    conditions: normalizedConditions,
    observedConditions: buildObservedConditionsFromConditions(normalizedConditions),
  }

  const legacyImageUseAuthorized = safeBoolean(merged.photoRecord?.imageUseAuthorized)
  const clinicalUseAuthorized = safeBoolean(merged.photoRecord?.clinicalUseAuthorized || legacyImageUseAuthorized)
  const marketingUseAuthorized = safeBoolean(merged.photoRecord?.marketingUseAuthorized || legacyImageUseAuthorized)
  const consentAwarenessConfirmed = safeBoolean(merged.photoRecord?.consentAwarenessConfirmed || (clinicalUseAuthorized && merged.photoRecord?.consentAcceptedAt))

  merged.photoRecord = {
    ...merged.photoRecord,
    photos: Array.isArray(merged.photoRecord?.photos)
      ? merged.photoRecord.photos.map(photo => ({
        id: photo.id,
        caption: safeText(photo.caption),
        fileName: safeText(photo.fileName),
        dataUrl: photo.dataUrl,
      }))
      : [],
    imageUseAuthorized: marketingUseAuthorized,
    clinicalUseAuthorized,
    marketingUseAuthorized,
    consentVersion: safeText(merged.photoRecord?.consentVersion) || PHOTO_CONSENT_VERSION,
    consentAcceptedAt: merged.photoRecord?.consentAcceptedAt ? safeText(merged.photoRecord.consentAcceptedAt) : null,
    consentAwarenessConfirmed,
  }

  merged.treatmentPlan = {
    ...merged.treatmentPlan,
    services: normalizeTreatmentServices(merged.treatmentPlan?.services, merged.treatmentPlan as unknown as UnknownRecord),
    sessionCount: merged.treatmentPlan?.sessionCount ?? '',
  }

  merged.treatmentObjective = safeText(merged.treatmentObjective)

  merged.signatures = {
    ...merged.signatures,
    patientSignatureDataUrl: safeText(merged.signatures?.patientSignatureDataUrl),
    professionalSignatureDataUrl: safeText(merged.signatures?.professionalSignatureDataUrl),
    professionalId: safePositiveInteger(merged.signatures?.professionalId),
    professionalName: safeText(merged.signatures?.professionalName),
    signedAt: normalizeDateInput(merged.signatures?.signedAt) || todayDateInput(),
  }

  return {
    id: record?.id,
    filledAt: record?.filledAt,
    updatedAt: record?.updatedAt,
    ...merged,
  }
}

export function updateFormValue(current: AnamnesisForm, path: Array<string | number>, value: unknown): AnamnesisForm {
  const next = { ...current }
  let cursor: MutableUnknownRecord = next as unknown as MutableUnknownRecord

  for (let index = 0; index < path.length - 1; index += 1) {
    const key = path[index]
    const currentValue = cursor[key]
    const clonedValue = Array.isArray(currentValue)
      ? [...currentValue]
      : isPlainRecord(currentValue)
        ? { ...currentValue }
        : {}

    cursor[key] = clonedValue
    cursor = clonedValue as MutableUnknownRecord
  }

  cursor[path[path.length - 1]] = value

  if (path.join('.') === 'identification.birthDate') {
    next.identification = {
      ...next.identification,
      age: calculateAgeFromBirthDate(value),
    }
  }

  if (path[0] === 'aestheticEvaluation' && path[1] === 'conditions') {
    next.aestheticEvaluation = {
      ...next.aestheticEvaluation,
      observedConditions: buildObservedConditionsFromConditions(next.aestheticEvaluation.conditions),
    }
  }

  if (path[0] === 'signatures' && !next.signatures.signedAt) {
    next.signatures = {
      ...next.signatures,
      signedAt: todayDateInput(),
    }
  }

  return next
}
export function buildAnamnesisPayload(form: AnamnesisForm): AnamnesisPayload {
  const conditions = normalizeAestheticConditions(
    form.aestheticEvaluation.conditions,
    form.aestheticEvaluation.observedConditions,
    form.healthHistory.dermatologicalHistory
  )
  const clinicalUseAuthorized = safeBoolean(form.photoRecord.clinicalUseAuthorized || form.photoRecord.imageUseAuthorized)
  const marketingUseAuthorized = safeBoolean(form.photoRecord.marketingUseAuthorized || form.photoRecord.imageUseAuthorized)
  const consentAwarenessConfirmed = safeBoolean(form.photoRecord.consentAwarenessConfirmed)
  const consentAcceptedAt = clinicalUseAuthorized
    ? safeText(form.photoRecord.consentAcceptedAt) || new Date().toISOString()
    : null

  return {
    identification: {
      fullName: safeText(form.identification.fullName).trim(),
      cpf: digitsOnly(form.identification.cpf),
      birthDate: normalizeDateInput(form.identification.birthDate),
      age: Number(form.identification.age || 0),
      sex: safeText(form.identification.sex).trim(),
      maritalStatus: safeText(form.identification.maritalStatus).trim(),
      profession: safeText(form.identification.profession).trim(),
      phone: safeText(form.identification.phone).trim(),
      email: safeText(form.identification.email).trim(),
      addressFull: safeText(form.identification.addressFull).trim(),
    },
    chiefComplaint: {
      desiredProcedure: safeText(form.chiefComplaint.desiredProcedure).trim(),
      currentDiscomfort: safeText(form.chiefComplaint.currentDiscomfort).trim(),
      complaintDuration: safeText(form.chiefComplaint.complaintDuration).trim(),
      previousTreatment: safeText(form.chiefComplaint.previousTreatment).trim(),
    },
    healthHistory: {
      preExistingConditions: { ...form.healthHistory.preExistingConditions },
      surgeries: {
        ...form.healthHistory.surgeries,
        surgeryDetails: safeText(form.healthHistory.surgeries.surgeryDetails).trim(),
        approximateDate: safeText(form.healthHistory.surgeries.approximateDate).trim(),
      },
      medications: {
        ...form.healthHistory.medications,
        medicationDetails: safeText(form.healthHistory.medications.medicationDetails).trim(),
      },
      allergies: {
        ...form.healthHistory.allergies,
        notes: safeText(form.healthHistory.allergies.notes).trim(),
      },
      dermatologicalHistory: { ...form.healthHistory.dermatologicalHistory },
      aestheticHistory: (form.healthHistory.aestheticHistory || [])
        .map(entry => createEmptyAestheticHistoryEntry(entry))
        .filter(entry => entry.procedureName || entry.procedureDate || entry.notes || entry.intercurrences)
        .map(entry => ({
          id: entry.id,
          procedureName: safeText(entry.procedureName).trim(),
          procedureDate: safeText(entry.procedureDate).trim(),
          notes: safeText(entry.notes).trim(),
          intercurrences: safeText(entry.intercurrences).trim(),
        })),
    },
    lifestyle: {
      ...form.lifestyle,
      dailyWaterIntake: safeText(form.lifestyle.dailyWaterIntake).trim(),
      diet: safeText(form.lifestyle.diet).trim(),
      workoutsPerWeek: safeNonNegativeInteger(form.lifestyle.workoutsPerWeek),
    },
    aestheticEvaluation: {
      skinType: safeText(form.aestheticEvaluation.skinType).trim(),
      fitzpatrick: safeText(form.aestheticEvaluation.fitzpatrick).trim(),
      conditions: conditions.map(condition => ({
        type: condition.type,
        label: safeText(condition.label).trim() || getConditionMeta(condition.type).label,
        present: safeBoolean(condition.present),
        classification: safeText(condition.classification).trim(),
        notes: safeText(condition.notes).trim(),
      })),
      observedConditions: buildObservedConditionsFromConditions(conditions),
    },
    contraindications: {
      ...form.contraindications,
      additionalNotes: safeText(form.contraindications.additionalNotes).trim(),
    },
    expectations: {
      ...form.expectations,
      treatmentExpectations: safeText(form.expectations.treatmentExpectations).trim(),
      expectedResultTimeline: safeText(form.expectations.expectedResultTimeline).trim(),
    },
    treatmentObjective: safeText(form.treatmentObjective).trim(),
    photoRecord: {
      imageUseAuthorized: marketingUseAuthorized,
      clinicalUseAuthorized,
      marketingUseAuthorized,
      consentVersion: safeText(form.photoRecord.consentVersion) || PHOTO_CONSENT_VERSION,
      consentAcceptedAt,
      consentAwarenessConfirmed,
      photos: (form.photoRecord.photos || []).map(photo => ({
        id: photo.id,
        caption: safeText(photo.caption).trim(),
        dataUrl: photo.dataUrl,
      })),
    },
    treatmentPlan: {
      recommendedProcedure: safeText(form.treatmentPlan.recommendedProcedure).trim(),
      sessionCount: form.treatmentPlan.sessionCount === '' ? null : Number(form.treatmentPlan.sessionCount),
      sessionInterval: safeText(form.treatmentPlan.sessionInterval).trim(),
      productsUsed: safeText(form.treatmentPlan.productsUsed).trim(),
      equipmentsUsed: safeText(form.treatmentPlan.equipmentsUsed).trim(),
      services: (form.treatmentPlan.services || [])
        .map(service => createEmptyTreatmentService(service))
        .filter(service => service.name || service.description || service.adverseEffects)
        .map(service => ({
          id: service.id,
          name: safeText(service.name).trim(),
          sessions: safeSessionCount(service.sessions),
          description: safeText(service.description).trim(),
          adverseEffects: safeText(service.adverseEffects).trim(),
        })),
    },
    scienceTerm: {
      ...form.scienceTerm,
    },
    signatures: {
      patientSignatureDataUrl: safeText(form.signatures.patientSignatureDataUrl),
      professionalSignatureDataUrl: safeText(form.signatures.professionalSignatureDataUrl),
      professionalId: safePositiveInteger(form.signatures.professionalId),
      professionalName: safeText(form.signatures.professionalName).trim(),
      signedAt: normalizeDateInput(form.signatures.signedAt) || todayDateInput(),
    },
  }
}

export function getAnamnesisHistorySummary(record: AnamnesisRecordVersion): string {
  return record.chiefComplaint.currentDiscomfort
    || record.chiefComplaint.desiredProcedure
    || record.treatmentObjective
    || record.expectations.treatmentExpectations
    || 'Registro clínico sem resumo informado.'
}

export function formatBooleanAnswer(value: unknown): string {
  return value ? 'Sim' : 'Não'
}

export function formatOptionLabel(options: SelectOption[], value: string): string {
  return options.find(option => option.value === value)?.label || ''
}

export function getAestheticConditionMeta(type: string): AestheticConditionMeta {
  return getConditionMeta(type)
}
