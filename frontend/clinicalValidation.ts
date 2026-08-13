import type { ClientRecord } from './clinicalTypes'

export interface ClinicalValidationResult {
  ready: boolean
  severity: 'success' | 'warning' | 'error'
  message: string
  details?: string[]
}

/**
 * Valida a prontidão clínica de um cliente antes da realização de um procedimento.
 * Checa o preenchimento de anamnese, assinaturas de termos e alertas médicos.
 */
export function validateClinicalReadiness(
  client: ClientRecord,
  service: { name: string; isCritical?: boolean }
): ClinicalValidationResult {
  const details: string[] = []

  // 1. Verifica se o prontuário está bloqueado
  if (client.isLocked) {
    return {
      ready: false,
      severity: 'error',
      message: 'Prontuário bloqueado para edições.',
      details: ['O prontuário deste paciente foi bloqueado e não permite novas intervenções.'],
    }
  }

  // 2. Verifica preenchimento da Anamnese
  const anamnesis = client.latestAnamnesis || (client.anamneses && client.anamneses[0])
  if (!anamnesis) {
    return {
      ready: false,
      severity: 'error',
      message: 'Ficha de Anamnese obrigatória ausente.',
      details: ['O paciente não possui nenhuma ficha de anamnese cadastrada no sistema.'],
    }
  }

  // 3. Verifica Termo de Consentimento se o serviço for crítico
  if (service.isCritical) {
    const hasSignedConsent = client.consentRecords?.some(
      (r) => r.status === 'SIGNED' || r.signedAt != null
    )
    if (!hasSignedConsent) {
      return {
        ready: false,
        severity: 'warning',
        message: 'Termo de consentimento pendente de assinatura.',
        details: [`O procedimento "${service.name}" exige assinatura digital prévia de um Termo de Consentimento.`],
      }
    }
  }

  // 4. Validações Específicas por Tipo de Procedimento (Tratamento-Aware)
  const allergies = anamnesis.healthHistory?.allergies
  const conditions = anamnesis.healthHistory?.preExistingConditions
  const medications = anamnesis.healthHistory?.medications
  const dermatological = anamnesis.healthHistory?.dermatologicalHistory

  const serviceName = String(service.name || '').toLowerCase()
  const hasHerpes = /herpes/i.test(conditions?.otherConditions || '') || /herpes/i.test(allergies?.notes || '')
  const hasAnestheticAllergy = allergies?.anestheticsAllergy || /anestes/i.test(allergies?.notes || '')
  const isLipFiller = serviceName.includes('preenchimento labial') || serviceName.includes('lip filler')
  const isBiostimulator = serviceName.includes('bioestimulador') || serviceName.includes('biostimulator')
  const isThreadLift = serviceName.includes('fios de sustentacao') || serviceName.includes('fios de sustentação') || serviceName.includes('thread lift')

  let hasTreatmentSpecificWarning = false

  if (isLipFiller) {
    if (hasHerpes) {
      details.push('Preenchimento Labial: Paciente possui histórico ou risco de herpes simples ativo. Recomenda-se profilaxia antiviral.')
      hasTreatmentSpecificWarning = true
    }
    if (hasAnestheticAllergy) {
      details.push('Preenchimento Labial: Alerta de sensibilidade a anestésicos locais.')
      hasTreatmentSpecificWarning = true
    }
  }

  if (isBiostimulator) {
    if (conditions?.autoimmuneDisease) {
      details.push('Bioestimulador de Colágeno: Contraindicação relativa para pacientes com doença autoimune ativa (risco de formação de nódulos).')
      hasTreatmentSpecificWarning = true
    }
    if (dermatological?.keloidTendency) {
      details.push('Bioestimulador de Colágeno: Paciente com tendência a queloides. Recomenda-se cautela na aplicação.')
      hasTreatmentSpecificWarning = true
    }
  }

  if (isThreadLift) {
    if (medications?.anticoagulants) {
      details.push('Fios de Sustentação: Uso de anticoagulantes relatado. Alto risco de hematomas e sangramento.')
      hasTreatmentSpecificWarning = true
    }
  }

  if (hasTreatmentSpecificWarning) {
    return {
      ready: true,
      severity: 'warning',
      message: `Alerta Clínico: Contraindicações ou riscos identificados para ${service.name}.`,
      details,
    }
  }

  // 5. Verifica se existem Alertas Clínicos ou Alergias gerais registradas na anamnese
  const hasAllergy = allergies?.hasAllergies || allergies?.medicationAllergy || allergies?.cosmeticsAllergy || allergies?.anestheticsAllergy
  const hasAutoimmuneOrSevere = conditions?.autoimmuneDisease || conditions?.heartDisease || conditions?.diabetes || conditions?.hypertension

  if (hasAllergy || hasAutoimmuneOrSevere) {
    if (hasAllergy) details.push('Paciente possui histórico de alergias registrado.')
    if (conditions?.autoimmuneDisease) details.push('Paciente possui doença autoimune registrada.')
    if (conditions?.heartDisease) details.push('Paciente possui condição cardíaca registrada.')
    if (conditions?.diabetes) details.push('Paciente possui diabetes registrada.')
    if (conditions?.hypertension) details.push('Paciente possui hipertensão registrada.')

    return {
      ready: true,
      severity: 'warning',
      message: 'Alerta Clínico: Paciente com alergias ou condições preexistentes.',
      details,
    }
  }

  return {
    ready: true,
    severity: 'success',
    message: 'Paciente apto para atendimento.',
    details: ['Nenhum impedimento clínico detectado.'],
  }
}
