function toIso(value) {
  return value ? new Date(value).toISOString() : null
}

function serializeDecimal(value) {
  return value === null || value === undefined ? null : String(value)
}

function buildMedicalRecordSummary(record) {
  if (!record) return null

  return {
    id: record.id,
    clientId: record.clientId,
    isPaid: Boolean(record.isPaid),
    isLocked: Boolean(record.isLocked),
    lockedAt: toIso(record.lockedAt),
    createdAt: toIso(record.createdAt),
    updatedAt: toIso(record.updatedAt),
  }
}

function buildAestheticHistoryEntry(entry) {
  return {
    id: entry.id,
    procedureName: entry.procedureName,
    procedureDate: toIso(entry.procedureDate),
    notes: entry.notes || '',
    complications: entry.complications || '',
    createdAt: toIso(entry.createdAt),
    updatedAt: toIso(entry.updatedAt),
  }
}

function buildAestheticEvaluation(evaluation) {
  return {
    id: evaluation.id,
    medicalRecordId: evaluation.medicalRecordId,
    evaluationType: evaluation.evaluationType,
    classification: evaluation.classification || '',
    intensity: evaluation.intensity || '',
    level: evaluation.level || '',
    notes: evaluation.notes || '',
    createdAt: toIso(evaluation.createdAt),
    updatedAt: toIso(evaluation.updatedAt),
  }
}

function buildAnamnesis(anamnesis) {
  if (!anamnesis) return null

  return {
    id: anamnesis.id,
    medicalRecordId: anamnesis.medicalRecordId,
    chiefComplaint: anamnesis.chiefComplaint || '',
    expectations: anamnesis.expectations || '',
    treatmentObjective: anamnesis.treatmentObjective || '',
    workoutsPerWeek: anamnesis.workoutsPerWeek,
    smoking: anamnesis.smoking,
    alcoholUse: anamnesis.alcoholUse,
    waterIntakeLiters: serializeDecimal(anamnesis.waterIntakeLiters),
    sleepQuality: anamnesis.sleepQuality || '',
    allergies: anamnesis.allergies || '',
    medications: anamnesis.medications || '',
    diseases: anamnesis.diseases || '',
    surgeries: anamnesis.surgeries || '',
    pregnancyStatus: anamnesis.pregnancyStatus || '',
    aestheticHistory: (anamnesis.aestheticHistory || []).map(buildAestheticHistoryEntry),
    createdAt: toIso(anamnesis.createdAt),
    updatedAt: toIso(anamnesis.updatedAt),
  }
}

function buildProtocolService(protocolService) {
  return {
    id: protocolService.id,
    protocolId: protocolService.protocolId,
    serviceId: protocolService.serviceId,
    customServiceName: protocolService.customServiceName || '',
    serviceName: protocolService.customServiceName || protocolService.service?.name || '',
    sessions: protocolService.sessions,
    description: protocolService.description || '',
    adverseEffects: protocolService.adverseEffects || '',
    sortOrder: protocolService.sortOrder,
    createdAt: toIso(protocolService.createdAt),
    updatedAt: toIso(protocolService.updatedAt),
  }
}

function buildProtocol(protocol) {
  return {
    id: protocol.id,
    medicalRecordId: protocol.medicalRecordId,
    clientId: protocol.clientId,
    protocolNumber: protocol.protocolNumber,
    protocolName: protocol.protocolName,
    recommendations: protocol.recommendations || '',
    guidelines: protocol.guidelines || '',
    notes: protocol.notes || '',
    treatmentObjective: protocol.treatmentObjective || '',
    status: protocol.status,
    services: (protocol.services || []).map(buildProtocolService),
    createdAt: toIso(protocol.createdAt),
    updatedAt: toIso(protocol.updatedAt),
  }
}

function buildAppointment(appointment) {
  return {
    id: appointment.id,
    clientId: appointment.clientId,
    protocolId: appointment.protocolId,
    scheduledAt: toIso(appointment.scheduledAt),
    status: appointment.status,
    hasArrived: Boolean(appointment.hasArrived),
    arrivedAt: toIso(appointment.arrivedAt),
    notes: appointment.notes || '',
    createdAt: toIso(appointment.createdAt),
    updatedAt: toIso(appointment.updatedAt),
  }
}

function buildPayment(payment) {
  return {
    id: payment.id,
    clientId: payment.clientId,
    medicalRecordId: payment.medicalRecordId,
    protocolId: payment.protocolId,
    amount: serializeDecimal(payment.amount),
    paymentMethod: payment.paymentMethod || '',
    paymentStatus: payment.paymentStatus,
    paidAt: toIso(payment.paidAt),
    externalReference: payment.externalReference || '',
    createdAt: toIso(payment.createdAt),
    updatedAt: toIso(payment.updatedAt),
  }
}

function buildPdfDocument(document) {
  return {
    id: document.id,
    clientId: document.clientId,
    medicalRecordId: document.medicalRecordId,
    protocolId: document.protocolId,
    fileName: document.fileName,
    fileUrl: document.fileUrl,
    documentType: document.documentType,
    generatedAt: toIso(document.generatedAt),
    createdAt: toIso(document.createdAt),
  }
}

function buildWhatsappMessage(message) {
  return {
    id: message.id,
    clientId: message.clientId,
    protocolId: message.protocolId,
    clinicPhone: message.clinicPhone,
    clientPhone: message.clientPhone,
    messageType: message.messageType,
    messageBody: message.messageBody,
    sentAt: toIso(message.sentAt),
    deliveryStatus: message.deliveryStatus,
    createdAt: toIso(message.createdAt),
  }
}

function buildClient(client) {
  return {
    id: client.id,
    fullName: client.fullName,
    cpf: client.cpf || '',
    birthDate: toIso(client.birthDate),
    phone: client.phone || '',
    email: client.email || '',
    emergencyContactName: client.emergencyContactName || '',
    emergencyContactPhone: client.emergencyContactPhone || '',
    status: client.status,
    createdAt: toIso(client.createdAt),
    updatedAt: toIso(client.updatedAt),
    medicalRecord: buildMedicalRecordSummary(client.medicalRecord),
  }
}

function buildMedicalRecord(record) {
  return {
    ...buildMedicalRecordSummary(record),
    client: record.client ? buildClient({ ...record.client, medicalRecord: null }) : null,
    anamnesis: buildAnamnesis(record.anamnesis),
    aestheticEvaluations: (record.aestheticEvaluations || []).map(buildAestheticEvaluation),
    protocols: (record.protocols || []).map(buildProtocol),
    payments: (record.payments || []).map(buildPayment),
    pdfDocuments: (record.pdfDocuments || []).map(buildPdfDocument),
  }
}

module.exports = {
  buildClient,
  buildMedicalRecord,
  buildMedicalRecordSummary,
  buildAnamnesis,
  buildAestheticEvaluation,
  buildProtocol,
  buildProtocolService,
  buildAppointment,
  buildPayment,
  buildPdfDocument,
  buildWhatsappMessage,
}
