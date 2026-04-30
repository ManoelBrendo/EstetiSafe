const ACTION_META = {
  API_V2_MEDICAL_RECORD_VIEW: { label: 'Prontuário aberto', category: 'Prontuario', severity: 'MEDIUM' },
  API_V2_CLIENT_MEDICAL_RECORD_VIEW: { label: 'Prontuário aberto', category: 'Prontuario', severity: 'MEDIUM' },
  API_V2_MEDICAL_RECORD_ANAMNESIS_HISTORY_VIEW: { label: 'Histórico de anamnese consultado', category: 'Prontuario', severity: 'MEDIUM' },
  API_V2_ANAMNESIS_VERSION_CREATE: { label: 'Nova versão de anamnese', category: 'Prontuario', severity: 'HIGH' },
  MEDICAL_RECORD_ANAMNESIS_CREATED: { label: 'Anamnese registrada', category: 'Prontuario', severity: 'HIGH' },
  API_V2_MEDICAL_RECORD_PDF_DOWNLOAD: { label: 'PDF de prontuário baixado', category: 'Prontuario', severity: 'HIGH' },
  MEDICAL_RECORD_PDF_DOWNLOAD: { label: 'PDF de prontuário baixado', category: 'Prontuario', severity: 'HIGH' },
  CONSENT_RECORD_IMAGE_USE_GENERATE: { label: 'Termo de imagem gerado', category: 'Consentimento', severity: 'HIGH' },
  CONSENT_RECORD_IMAGE_USE_REUSE_PENDING: { label: 'Termo de imagem pendente reutilizado', category: 'Consentimento', severity: 'MEDIUM' },
  CONSENT_RECORD_PDF_DOWNLOAD: { label: 'PDF de consentimento baixado', category: 'Consentimento', severity: 'HIGH' },
  CONSENT_RECORD_SIGN: { label: 'Consentimento assinado', category: 'Consentimento', severity: 'HIGH' },
  CONSENT_RECORD_REVOKE: { label: 'Consentimento revogado', category: 'Consentimento', severity: 'HIGH' },
  API_V2_CLIENT_CREATE: { label: 'Cliente criado', category: 'Clientes', severity: 'LOW' },
  API_V2_CLIENT_UPDATE: { label: 'Cliente atualizado', category: 'Clientes', severity: 'MEDIUM' },
  API_V2_CLIENT_LOCKED_UPDATE_BLOCKED: { label: 'Edição bloqueada de cliente', category: 'Prontuario', severity: 'HIGH' },
  API_V2_PAYMENT_UPSERT: { label: 'Pagamento registrado', category: 'Financeiro', severity: 'MEDIUM' },
  API_V2_PAYMENT_UPDATE: { label: 'Pagamento atualizado', category: 'Financeiro', severity: 'MEDIUM' },
  CLINIC_DOCUMENT_CREATE: { label: 'Documento cadastrado', category: 'Documentos', severity: 'MEDIUM' },
  CLINIC_DOCUMENT_VIEW: { label: 'Documento aberto', category: 'Documentos', severity: 'MEDIUM' },
  CLINIC_DOCUMENT_UPDATE: { label: 'Documento atualizado', category: 'Documentos', severity: 'HIGH' },
  CLINIC_DOCUMENT_DELETE: { label: 'Documento removido', category: 'Documentos', severity: 'HIGH' },
  API_V2_PROTOCOL_UPSERT: { label: 'Protocolo atualizado', category: 'Prontuario', severity: 'MEDIUM' },
  INVENTORY_PRODUCT_CREATE: { label: 'Produto cadastrado', category: 'Operação', severity: 'MEDIUM' },
  INVENTORY_PRODUCT_UPDATE: { label: 'Produto atualizado', category: 'Operação', severity: 'MEDIUM' },
  INVENTORY_PRODUCT_ARCHIVE: { label: 'Produto arquivado', category: 'Operação', severity: 'HIGH' },
  INVENTORY_EQUIPMENT_CREATE: { label: 'Equipamento cadastrado', category: 'Operação', severity: 'MEDIUM' },
  INVENTORY_EQUIPMENT_UPDATE: { label: 'Equipamento atualizado', category: 'Operação', severity: 'MEDIUM' },
  INVENTORY_EQUIPMENT_ARCHIVE: { label: 'Equipamento arquivado', category: 'Operação', severity: 'HIGH' },
  SERVICE_CREATE: { label: 'Serviço cadastrado', category: 'Operação', severity: 'MEDIUM' },
  SERVICE_UPDATE: { label: 'Serviço atualizado', category: 'Operação', severity: 'MEDIUM' },
  SERVICE_ARCHIVE: { label: 'Serviço arquivado', category: 'Operação', severity: 'HIGH' },
  BILLING_CONFIG_UPDATED: { label: 'Assinatura ajustada', category: 'Financeiro', severity: 'HIGH' },
  BILLING_MARKED_PAID: { label: 'Pagamento confirmado', category: 'Financeiro', severity: 'HIGH' },
  CLINIC_BILL_CREATE: { label: 'Conta da clínica criada', category: 'Financeiro', severity: 'MEDIUM' },
  CLINIC_BILL_UPDATE: { label: 'Conta da clínica atualizada', category: 'Financeiro', severity: 'MEDIUM' },
  CLINIC_BILL_MARK_PAID: { label: 'Conta da clínica baixada', category: 'Financeiro', severity: 'HIGH' },
  CLINIC_BILL_DELETE: { label: 'Conta da clínica removida', category: 'Financeiro', severity: 'HIGH' },
  BILLING_GATEWAY_INTENT_CREATED: { label: 'Cobrança preparada', category: 'Financeiro', severity: 'MEDIUM' },
  BILLING_GATEWAY_PAYMENT_CONFIRMED: { label: 'Gateway confirmado', category: 'Financeiro', severity: 'HIGH' },
  BILLING_GATEWAY_WEBHOOK_RECEIVED: { label: 'Webhook financeiro recebido', category: 'Financeiro', severity: 'LOW' },
  SUPPORT_ASSUME_CLINIC: { label: 'Suporte acessou a clínica', category: 'Suporte', severity: 'HIGH' },
  AUTH_REGISTER: { label: 'Cadastro inicial', category: 'Sistema', severity: 'LOW' },
  INTERCURRENCE_CREATE: { label: 'Intercorrência registrada', category: 'Intercorrências', severity: 'HIGH' },
  INTERCURRENCE_UPDATE: { label: 'Intercorrência editada', category: 'Intercorrências', severity: 'HIGH' },
}

function humanizeAction(action) {
  return String(action || 'Ação registrada')
    .toLowerCase()
    .split('_')
    .filter(Boolean)
    .map(part => part.charAt(0).toUpperCase() + part.slice(1))
    .join(' ')
}

function classifyAuditAction(action) {
  const normalized = String(action || '')
  if (ACTION_META[normalized]) return ACTION_META[normalized]

  if (normalized.includes('MEDICAL') || normalized.includes('ANAMNESIS') || normalized.includes('PROTOCOL')) {
    return { label: humanizeAction(normalized), category: 'Prontuario', severity: 'MEDIUM' }
  }

  if (normalized.includes('INTERCURRENCE')) {
    return { label: humanizeAction(normalized), category: 'Intercorrências', severity: 'HIGH' }
  }

  if (normalized.includes('CONSENT')) {
    return { label: humanizeAction(normalized), category: 'Consentimento', severity: 'HIGH' }
  }

  if (normalized.includes('DOCUMENT')) {
    return { label: humanizeAction(normalized), category: 'Documentos', severity: 'MEDIUM' }
  }

  if (normalized.includes('BILLING') || normalized.includes('PAYMENT') || normalized.includes('GATEWAY')) {
    return { label: humanizeAction(normalized), category: 'Financeiro', severity: 'MEDIUM' }
  }

  if (normalized.includes('INVENTORY') || normalized.includes('PRODUCT') || normalized.includes('EQUIPMENT') || normalized.includes('SERVICE')) {
    return { label: humanizeAction(normalized), category: 'Operação', severity: 'MEDIUM' }
  }

  if (normalized.includes('SUPPORT')) {
    return { label: humanizeAction(normalized), category: 'Suporte', severity: 'HIGH' }
  }

  if (normalized.includes('CLIENT')) {
    return { label: humanizeAction(normalized), category: 'Clientes', severity: 'LOW' }
  }

  return { label: humanizeAction(normalized), category: 'Sistema', severity: 'LOW' }
}

function getMetadataRecord(metadata) {
  return metadata && typeof metadata === 'object' && !Array.isArray(metadata) ? metadata : {}
}

function getMetadataValue(metadata, keys) {
  const record = getMetadataRecord(metadata)
  for (const key of keys) {
    const value = record[key]
    if (value !== null && value !== undefined && String(value).trim() !== '') {
      return String(value)
    }
  }
  return null
}

function describeAuditLog(log, meta = classifyAuditAction(log?.action)) {
  const clientName = getMetadataValue(log?.metadata, ['clientName', 'patientName', 'name'])
  const clinicName = getMetadataValue(log?.metadata, ['clinicName'])
  const path = getMetadataValue(log?.metadata, ['path'])

  if (clientName && meta.category === 'Prontuario') {
    return `${meta.label} para ${clientName}.`
  }

  if (clientName && meta.category === 'Consentimento') {
    return `${meta.label} vinculado a ${clientName}.`
  }

  if (meta.category === 'Intercorrências') {
    const procedureName = getMetadataValue(log?.metadata, ['procedureName'])
    const professionalName = getMetadataValue(log?.metadata, ['professionalName'])
    const procedureLabel = procedureName ? `: ${procedureName}` : ''
    const clientLabel = clientName ? ` para ${clientName}` : ''
    const professionalLabel = professionalName ? ` com ${professionalName}` : ''
    return `${meta.label}${procedureLabel}${clientLabel}${professionalLabel}.`
  }

  if (meta.category === 'Operação') {
    const itemName = getMetadataValue(log?.metadata, ['name', 'title', 'serviceName'])
    const assetType = getMetadataValue(log?.metadata, ['assetType'])
    const assetLabel = assetType === 'PRODUCT' ? 'produto' : assetType === 'EQUIPMENT' ? 'equipamento' : 'cadastro operacional'
    return itemName
      ? `${meta.label}: ${itemName}.`
      : `${meta.label} em ${assetLabel}.`
  }

  if (meta.category === 'Documentos') {
    const documentTitle = getMetadataValue(log?.metadata, ['title', 'documentType', 'fileName'])
    const fileName = getMetadataValue(log?.metadata, ['fileName'])
    const fileLabel = fileName && fileName !== documentTitle ? `, arquivo ${fileName}` : ''
    return documentTitle
      ? `${meta.label}: ${documentTitle}${fileLabel}.`
      : `${meta.label} na base documental da clínica.`
  }
  if (clinicName) {
    return `${meta.label} em ${clinicName}.`
  }

  if (path) {
    return `${meta.label} pela rota ${path}.`
  }

  if (log?.entityType) {
    return `${meta.label} em ${log.entityType}${log.entityId ? ` #${log.entityId}` : ''}.`
  }

  return `${meta.label} registrada no sistema.`
}

function serializeAuditLog(log) {
  const meta = classifyAuditAction(log?.action)
  return {
    id: log.id,
    clinicId: log.clinicId ?? null,
    actorUserId: log.actorUserId ?? null,
    actorEmail: log.actorEmail ?? null,
    actorRole: log.actorRole ?? null,
    action: log.action,
    actionLabel: meta.label,
    category: meta.category,
    severity: meta.severity,
    entityType: log.entityType ?? null,
    entityId: log.entityId ?? null,
    metadata: log.metadata ?? null,
    description: describeAuditLog(log, meta),
    createdAt: log.createdAt ?? null,
  }
}

function buildAuditLogSummary(actionGroups = [], total = 0) {
  const byCategoryMap = new Map()
  const byAction = actionGroups.map(group => {
    const meta = classifyAuditAction(group.action)
    const count = group._count?._all || group._count?.action || 0
    byCategoryMap.set(meta.category, (byCategoryMap.get(meta.category) || 0) + count)

    return {
      action: group.action,
      label: meta.label,
      category: meta.category,
      severity: meta.severity,
      count,
    }
  })

  const highRiskCount = byAction
    .filter(item => item.severity === 'HIGH')
    .reduce((sum, item) => sum + item.count, 0)

  const byCategory = Array.from(byCategoryMap.entries())
    .map(([category, count]) => ({ category, count }))
    .sort((left, right) => right.count - left.count)

  return {
    total,
    highRiskCount,
    byAction: byAction.sort((left, right) => right.count - left.count),
    byCategory,
  }
}

module.exports = {
  ACTION_META,
  humanizeAction,
  classifyAuditAction,
  getMetadataValue,
  describeAuditLog,
  serializeAuditLog,
  buildAuditLogSummary,
}
