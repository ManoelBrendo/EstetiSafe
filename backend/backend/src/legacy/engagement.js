const DAY_MS = 24 * 60 * 60 * 1000

function toDate(value) {
  if (!value) return null
  const date = value instanceof Date ? value : new Date(value)
  return Number.isNaN(date.getTime()) ? null : date
}

function normalizePhoneNumber(value) {
  return String(value || '').replace(/\D/g, '')
}

function daysBetween(now, date) {
  if (!date) return null
  return Math.floor((now.getTime() - date.getTime()) / DAY_MS)
}

function hasUsablePhone(client) {
  return normalizePhoneNumber(client?.phone).length >= 8
}

function isOptedOut(client) {
  return Boolean(client?.marketingOptOut || client?.communicationOptOut || client?.notificationsOptOut)
}

function isCancelledAppointment(appointment) {
  return ['CANCELLED', 'NO_SHOW', 'cancelled'].includes(String(appointment?.status || ''))
}

function getAppointmentDate(appointment) {
  return toDate(appointment?.startAt || appointment?.scheduledAt || appointment?.date || appointment?.createdAt)
}

function hasUpcomingAppointment(client, now) {
  return (client?.appointments || []).some(appointment => {
    const date = getAppointmentDate(appointment)
    return date && date.getTime() > now.getTime() && !isCancelledAppointment(appointment)
  })
}

function getLastPastAppointment(client, now) {
  return (client?.appointments || [])
    .map(appointment => ({ appointment, date: getAppointmentDate(appointment) }))
    .filter(item => item.date && item.date.getTime() <= now.getTime() && !isCancelledAppointment(item.appointment))
    .sort((left, right) => right.date.getTime() - left.date.getTime())[0]?.date || null
}

function getFirstName(name) {
  return String(name || 'cliente').trim().split(/\s+/)[0] || 'cliente'
}

function buildReactivationMessage(candidate, clinicName = 'sua clinica') {
  const firstName = getFirstName(candidate.name)
  return `Ola, ${firstName}. Sentimos sua falta na ${clinicName}. Podemos te ajudar a agendar uma nova avaliacao? Responda SIM para continuar.`
}

function getPriority(daysSinceLastAppointment, reason) {
  if (reason === 'NO_APPOINTMENT_CREATED') return 'LOW'
  if (daysSinceLastAppointment >= 180) return 'HIGH'
  if (daysSinceLastAppointment >= 90) return 'MEDIUM'
  return 'LOW'
}

function buildReactivationCandidates(clients = [], options = {}) {
  const now = options.now instanceof Date ? options.now : new Date()
  const inactiveDaysThreshold = Number.isFinite(options.inactiveDaysThreshold) ? options.inactiveDaysThreshold : 90
  const newClientDaysThreshold = Number.isFinite(options.newClientDaysThreshold) ? options.newClientDaysThreshold : 30
  const limit = Number.isFinite(options.limit) ? options.limit : 25
  const clinicName = options.clinicName || 'sua clinica'
  const candidates = []

  for (const client of clients) {
    if (!client || isOptedOut(client) || !hasUsablePhone(client) || hasUpcomingAppointment(client, now)) {
      continue
    }

    const createdAt = toDate(client.createdAt)
    const daysSinceCreated = daysBetween(now, createdAt)
    const lastAppointmentAt = getLastPastAppointment(client, now)
    const daysSinceLastAppointment = daysBetween(now, lastAppointmentAt)
    let reason = null

    if (lastAppointmentAt && daysSinceLastAppointment >= inactiveDaysThreshold) {
      reason = 'NO_RECENT_APPOINTMENT'
    } else if (!lastAppointmentAt && daysSinceCreated !== null && daysSinceCreated >= newClientDaysThreshold) {
      reason = 'NO_APPOINTMENT_CREATED'
    }

    if (!reason) continue

    const candidate = {
      clientId: client.id,
      name: client.name || client.fullName || 'Cliente',
      phone: normalizePhoneNumber(client.phone),
      priority: getPriority(daysSinceLastAppointment || 0, reason),
      reason,
      recommendedChannel: 'WHATSAPP',
      daysSinceLastAppointment,
      daysSinceCreated,
      lastAppointmentAt: lastAppointmentAt ? lastAppointmentAt.toISOString() : null,
      suggestedMessage: '',
    }

    candidate.suggestedMessage = buildReactivationMessage(candidate, clinicName)
    candidates.push(candidate)
  }

  return candidates
    .sort((left, right) => {
      const priorityOrder = { HIGH: 3, MEDIUM: 2, LOW: 1 }
      const priorityDiff = priorityOrder[right.priority] - priorityOrder[left.priority]
      if (priorityDiff !== 0) return priorityDiff

      const leftDays = left.daysSinceLastAppointment ?? left.daysSinceCreated ?? 0
      const rightDays = right.daysSinceLastAppointment ?? right.daysSinceCreated ?? 0
      return rightDays - leftDays
    })
    .slice(0, limit)
}

function buildEngagementDashboard(clients = [], options = {}) {
  const candidates = buildReactivationCandidates(clients, options)

  return {
    mode: 'selection_only',
    autoSendEnabled: false,
    totalClients: clients.length,
    eligibleCount: candidates.length,
    candidates,
    message: 'Campanhas preparadas para revisao. Nenhuma mensagem e enviada automaticamente nesta etapa.',
  }
}

module.exports = {
  buildEngagementDashboard,
  buildReactivationCandidates,
  buildReactivationMessage,
  normalizePhoneNumber,
}