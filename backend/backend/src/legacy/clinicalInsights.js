const {
  summarizeEquipmentItem,
  summarizeProductItem,
} = require('./inventory')

const priorityScore = {
  CRITICAL: 3,
  WARNING: 2,
  INFO: 1,
}

const anamnesisRules = [
  {
    kind: 'PREGNANCY_ATTENTION',
    priority: 'CRITICAL',
    pathTerms: ['gestacao', 'gravidez', 'pregnancy', 'gestante', 'amament'],
    textTerms: ['gestante', 'gravida', 'amamentando', 'lactante'],
    positiveTerms: ['sim', 'positivo', 'gestante', 'gravida', 'amamentando', 'lactante', 'true'],
    title: 'Revisar gestacao ou amamentacao',
    description: 'A anamnese indica possivel gestacao, amamentacao ou condicao relacionada que exige validacao profissional antes do atendimento.',
    actionLabel: 'Validar antes do procedimento',
  },
  {
    kind: 'ALLERGY_REVIEW',
    priority: 'CRITICAL',
    pathTerms: ['alergia', 'allergy', 'allerg'],
    textTerms: ['alergia', 'alergico', 'anafilaxia', 'lidocaina'],
    title: 'Revisar alergias informadas',
    description: 'A anamnese contem sinal de alergia ou sensibilidade que deve ser conferido antes de qualquer produto ou procedimento.',
    actionLabel: 'Conferir alergias',
  },
  {
    kind: 'MEDICATION_REVIEW',
    priority: 'WARNING',
    pathTerms: ['medicamento', 'medicacao', 'medication', 'remedio', 'uso-continuo', 'uso_continuo'],
    textTerms: ['anticoagulante', 'isotretinoina', 'roacutan', 'corticoide', 'antibiotico'],
    title: 'Revisar medicamentos em uso',
    description: 'A anamnese menciona medicamento ou substancia que pode alterar conduta, intervalo ou necessidade de avaliacao adicional.',
    actionLabel: 'Revisar medicacao',
  },
  {
    kind: 'CLINICAL_CONDITION_REVIEW',
    priority: 'WARNING',
    pathTerms: ['doenca', 'disease', 'diabetes', 'hipertensao', 'cardiaco', 'condicao'],
    textTerms: ['diabetes', 'hipertensao', 'cardiaco', 'epilepsia', 'cancer'],
    title: 'Revisar condicoes clinicas',
    description: 'A anamnese contém condição clínica que deve ser considerada na avaliação profissional.',
    actionLabel: 'Revisar histórico clínico',
  },
]

function normalizeText(value) {
  return String(value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
}

function slug(value) {
  return normalizeText(value)
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 90) || 'item'
}

function createInsight({ source, kind, priority, title, description, evidence, actionLabel, metadata }) {
  return {
    id: [source, kind, metadata?.id || metadata?.name || title].map(slug).join(':'),
    source,
    kind,
    priority,
    title,
    description,
    evidence: evidence.filter(Boolean).slice(0, 4),
    actionLabel,
    metadata: metadata || {},
  }
}

function sortInsights(insights) {
  return insights.slice().sort((left, right) => {
    const priorityDiff = (priorityScore[right.priority] || 0) - (priorityScore[left.priority] || 0)
    if (priorityDiff !== 0) return priorityDiff

    const leftDays = Number.isFinite(left.metadata?.daysUntilDue) ? left.metadata.daysUntilDue : Number.MAX_SAFE_INTEGER
    const rightDays = Number.isFinite(right.metadata?.daysUntilDue) ? right.metadata.daysUntilDue : Number.MAX_SAFE_INTEGER
    if (leftDays !== rightDays) return leftDays - rightDays

    return left.title.localeCompare(right.title)
  })
}

function buildInventoryPredictiveInsights(products = [], equipmentItems = [], options = {}) {
  const lowStockThreshold = Number.isFinite(options.lowStockThreshold) ? options.lowStockThreshold : 1
  const insights = []

  for (const productRecord of products) {
    const product = summarizeProductItem(productRecord)
    if (!product || product.active === false) continue

    const quantity = Number(product.quantity || 0)
    const productEvidence = [
      product.name,
      product.batch ? `Lote: ${product.batch}` : null,
      product.expiresAt ? `Vencimento: ${new Date(product.expiresAt).toISOString()}` : null,
      `Quantidade: ${quantity}${product.unit ? ` ${product.unit}` : ''}`,
    ]

    if (product.status === 'OVERDUE') {
      insights.push(createInsight({
        source: 'inventory',
        kind: 'EXPIRED_PRODUCT',
        priority: 'CRITICAL',
        title: `Produto vencido: ${product.name}`,
        description: 'Produto ativo está vencido e deve ser retirado do uso até revisão da clínica.',
        evidence: productEvidence,
        actionLabel: 'Bloquear uso e revisar descarte',
        metadata: { id: product.id, name: product.name, daysUntilDue: product.daysUntilDue },
      }))
    } else if (product.status === 'WARNING') {
      insights.push(createInsight({
        source: 'inventory',
        kind: 'PRODUCT_EXPIRING_SOON',
        priority: 'WARNING',
        title: `Produto perto do vencimento: ${product.name}`,
        description: 'Produto ativo esta dentro da janela de alerta e deve ter uso, reposicao ou descarte planejado.',
        evidence: productEvidence,
        actionLabel: 'Planejar uso ou reposicao',
        metadata: { id: product.id, name: product.name, daysUntilDue: product.daysUntilDue },
      }))
    }

    if (quantity <= lowStockThreshold) {
      insights.push(createInsight({
        source: 'inventory',
        kind: 'LOW_STOCK',
        priority: quantity <= 0 ? 'CRITICAL' : 'WARNING',
        title: `Estoque baixo: ${product.name}`,
        description: 'Quantidade atual esta abaixo do limite configurado para operacao segura.',
        evidence: productEvidence,
        actionLabel: 'Avaliar reposicao',
        metadata: { id: product.id, name: product.name, quantity, lowStockThreshold },
      }))
    }
  }

  for (const equipmentRecord of equipmentItems) {
    const equipment = summarizeEquipmentItem(equipmentRecord)
    if (!equipment || equipment.active === false) continue

    const equipmentEvidence = [
      equipment.name,
      equipment.serialNumber ? `Serie: ${equipment.serialNumber}` : null,
      equipment.maintenanceDueAt ? `Manutencao: ${new Date(equipment.maintenanceDueAt).toISOString()}` : null,
    ]

    if (equipment.status === 'OVERDUE') {
      insights.push(createInsight({
        source: 'equipment',
        kind: 'MAINTENANCE_OVERDUE',
        priority: 'CRITICAL',
        title: `Manutencao vencida: ${equipment.name}`,
        description: 'Equipamento ativo esta com manutencao vencida e precisa de revisao antes de uso continuado.',
        evidence: equipmentEvidence,
        actionLabel: 'Agendar manutencao',
        metadata: { id: equipment.id, name: equipment.name, daysUntilDue: equipment.daysUntilDue },
      }))
    } else if (equipment.status === 'WARNING') {
      insights.push(createInsight({
        source: 'equipment',
        kind: 'MAINTENANCE_DUE_SOON',
        priority: 'WARNING',
        title: `Manutencao proxima: ${equipment.name}`,
        description: 'Equipamento ativo está próximo da manutenção preventiva.',
        evidence: equipmentEvidence,
        actionLabel: 'Planejar manutencao',
        metadata: { id: equipment.id, name: equipment.name, daysUntilDue: equipment.daysUntilDue },
      }))
    }
  }

  return sortInsights(insights)
}

function flattenAnswerEntries(value, path = [], entries = []) {
  if (value === null || value === undefined || value === '') return entries

  if (Array.isArray(value)) {
    value.slice(0, 20).forEach((item, index) => flattenAnswerEntries(item, path.concat(String(index)), entries))
    return entries
  }

  if (typeof value === 'object') {
    Object.entries(value).forEach(([key, item]) => flattenAnswerEntries(item, path.concat(key), entries))
    return entries
  }

  entries.push({
    path: path.join('.'),
    value,
    text: String(value),
    normalizedPath: normalizeText(path.join('.')),
    normalizedText: normalizeText(value),
  })

  return entries
}

function hasNegativeSignal(entry) {
  return /\b(nao|nega|negativo|sem|nenhuma|nenhum|false|0)\b/.test(entry.normalizedText)
}

function hasPositiveSignal(entry, rule) {
  if (entry.value === true) return true
  return (rule.positiveTerms || []).some(term => entry.normalizedText.includes(term))
}

function entryMatchesRule(entry, rule) {
  const pathMatches = rule.pathTerms.some(term => entry.normalizedPath.includes(term))
  const textMatches = rule.textTerms.some(term => entry.normalizedText.includes(term))

  if (hasNegativeSignal(entry)) return false
  if (rule.positiveTerms && pathMatches) return hasPositiveSignal(entry, rule)
  if (entry.value === true && pathMatches) return true
  return pathMatches || textMatches
}

function extractAnamnesisRiskSignals(anamnesis) {
  const answers = anamnesis?.answers && typeof anamnesis.answers === 'object'
    ? anamnesis.answers
    : (anamnesis && typeof anamnesis === 'object' ? anamnesis : {})
  const entries = flattenAnswerEntries(answers)
  const insights = []

  for (const rule of anamnesisRules) {
    const matches = entries.filter(entry => entryMatchesRule(entry, rule))
    if (matches.length === 0) continue

    insights.push(createInsight({
      source: 'anamnesis',
      kind: rule.kind,
      priority: rule.priority,
      title: rule.title,
      description: rule.description,
      evidence: matches.map(match => `${match.path}: ${match.text}`),
      actionLabel: rule.actionLabel,
      metadata: { matchCount: matches.length },
    }))
  }

  return sortInsights(insights)
}

function countByPriority(insights) {
  return insights.reduce((acc, insight) => {
    acc[insight.priority] += 1
    return acc
  }, { INFO: 0, WARNING: 0, CRITICAL: 0 })
}

function buildAiReadiness(env = process.env) {
  const wantsExternalAi = env.CLINICAL_AI_ENABLED === 'true'
  const provider = env.CLINICAL_AI_PROVIDER || (wantsExternalAi ? 'EXTERNAL_AI' : 'RULES_ENGINE')
  const missing = []

  if (wantsExternalAi && !env.CLINICAL_AI_API_KEY) missing.push('CLINICAL_AI_API_KEY')

  const externalAiEnabled = wantsExternalAi && missing.length === 0

  return {
    mode: externalAiEnabled ? 'external_ai_ready' : 'deterministic_rules',
    provider,
    externalAiEnabled,
    ready: !wantsExternalAi || externalAiEnabled,
    missing,
    safeguards: ['human_review_required', 'no_automatic_diagnosis', 'audit_friendly_rules'],
    message: externalAiEnabled
      ? 'IA externa habilitada com revisao humana obrigatoria antes de qualquer conduta.'
      : 'Insights operando por regras auditaveis, sem diagnostico automatico e sem envio externo de dados clinicos.',
  }
}

function buildClinicalInsights(input = {}) {
  const readiness = buildAiReadiness(input.env || process.env)
  const inventoryInsights = buildInventoryPredictiveInsights(input.products || [], input.equipmentItems || [], input.options || {})
  const anamnesisInsights = extractAnamnesisRiskSignals(input.anamnesis || null)
  const limit = Number.isFinite(input.limit) ? input.limit : 12
  const insights = sortInsights([...inventoryInsights, ...anamnesisInsights]).slice(0, limit)

  return {
    mode: readiness.externalAiEnabled ? 'external_ai' : 'deterministic',
    externalAiEnabled: readiness.externalAiEnabled,
    readiness,
    generatedAt: (input.now instanceof Date ? input.now : new Date()).toISOString(),
    total: insights.length,
    countsByPriority: countByPriority(insights),
    insights,
    message: 'Insights gerados por regras auditaveis. Use como apoio operacional, nao como diagnostico automatico.',
  }
}

module.exports = {
  buildAiReadiness,
  buildClinicalInsights,
  buildInventoryPredictiveInsights,
  extractAnamnesisRiskSignals,
  sortInsights,
}