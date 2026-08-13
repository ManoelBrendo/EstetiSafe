const {
  assertEditableClient,
  buildMedicalRecordAuditMetadata,
} = require('../../lib/medical-records')
const { parseOptionalDate, sanitizeCpf, compactObject, httpError } = require('../../lib/http')

const clientDetailInclude = {
  anamneses: {
    orderBy: { filledAt: 'desc' },
  },
  appointments: {
    orderBy: { startAt: 'desc' },
    include: {
      service: true,
      professional: true,
      payment: true,
    },
  },
  consentRecords: {
    orderBy: { createdAt: 'desc' },
    include: {
      professional: true,
    },
  },
}

function normalizeClientPayload(payload) {
  return compactObject({
    name: payload.fullName?.trim() || payload.name?.trim() || undefined,
    email: payload.email?.trim() || undefined,
    phone: payload.phone?.trim() || undefined,
    birthDate: parseOptionalDate(payload.birthDate, 'birthDate') || undefined,
    cpf: sanitizeCpf(payload.cpf) || undefined,
    photoDataUrl: payload.photoDataUrl === null ? null : payload.photoDataUrl?.trim() || undefined,
    sex: payload.sex?.trim() || undefined,
    maritalStatus: payload.maritalStatus?.trim() || undefined,
    profession: payload.profession?.trim() || undefined,
    addressFull: payload.addressFull?.trim() || undefined,
    notes: payload.notes?.trim() || undefined,
  })
}

class ClientsService {
  constructor(clientsRepository, auditService) {
    this.clientsRepository = clientsRepository
    this.auditService = auditService
  }

  async listClients(userId, { search, pagination }) {
    const where = {
      userId,
      deletedAt: null,
      ...(search ? {
        OR: [
          { name: { contains: search, mode: 'insensitive' } },
          { email: { contains: search, mode: 'insensitive' } },
          { phone: { contains: search } },
          { cpf: { contains: search } },
        ],
      } : {}),
    }

    const include = {
      anamneses: { orderBy: { filledAt: 'desc' }, take: 1 },
      consentRecords: { orderBy: { createdAt: 'desc' }, take: 10 },
      appointments: {
        orderBy: { startAt: 'desc' },
        take: 1,
        include: {
          service: true,
          professional: true,
          payment: true,
        },
      },
      _count: {
        select: {
          appointments: true,
          anamneses: true,
          consentRecords: true,
        },
      },
    }

    const [items, total] = await Promise.all([
      this.clientsRepository.findMany({
        where,
        orderBy: { name: 'asc' },
        skip: pagination.skip,
        take: pagination.take,
        include,
      }),
      this.clientsRepository.count({ where }),
    ])

    return { items, total }
  }

  async createClient(userId, payload, req) {
    const data = {
      ...normalizeClientPayload(payload),
      userId,
    }

    const include = {
      anamneses: true,
      consentRecords: true,
      appointments: {
        include: { service: true, professional: true, payment: true },
      },
    }

    const created = await this.clientsRepository.create({ data, include })

    await this.auditService.log(req, {
      action: 'API_V2_CLIENT_CREATE',
      entityType: 'Client',
      entityId: created.id,
      metadata: { path: '/api/v2/clients', hasPhotoDataUrl: Boolean(created.photoDataUrl) },
    })

    return created
  }

  async getClient(userId, clientId) {
    const client = await this.clientsRepository.findFirst({
      where: { id: clientId, userId, deletedAt: null },
      include: clientDetailInclude,
    })

    if (!client) {
      throw httpError(404, 'Cliente nao encontrado.')
    }

    return client
  }

  async updateClient(userId, clientId, payload, req) {
    const normalizedPayload = normalizeClientPayload(payload)
    const currentClient = await this.getClient(userId, clientId)

    if (currentClient.isLocked) {
      await this.auditService.log(req, {
        action: 'API_V2_CLIENT_LOCKED_UPDATE_BLOCKED',
        entityType: 'Client',
        entityId: currentClient.id,
        metadata: buildMedicalRecordAuditMetadata(currentClient, `/api/v2/clients/${currentClient.id}`, {
          attemptedFields: Object.keys(normalizedPayload),
          blockedReason: 'medical_record_locked_after_payment',
        }),
      })

      assertEditableClient(currentClient)
    }

    const updated = await this.clientsRepository.update({
      where: { id: clientId },
      data: normalizedPayload,
      include: {
        anamneses: { orderBy: { filledAt: 'desc' } },
        consentRecords: { orderBy: { createdAt: 'desc' }, include: { professional: true } },
        appointments: {
          orderBy: { startAt: 'desc' },
          include: { service: true, professional: true, payment: true },
        },
      },
    })

    await this.auditService.log(req, {
      action: 'API_V2_CLIENT_UPDATE',
      entityType: 'Client',
      entityId: updated.id,
      metadata: {
        path: `/api/v2/clients/${updated.id}`,
        changedFields: Object.keys(normalizedPayload),
        changedPhoto: Object.prototype.hasOwnProperty.call(normalizedPayload, 'photoDataUrl'),
      },
    })

    return updated
  }

  async getMedicalRecord(userId, clientId, req) {
    const client = await this.getClient(userId, clientId)

    await this.auditService.log(req, {
      action: 'API_V2_CLIENT_MEDICAL_RECORD_VIEW',
      entityType: 'Client',
      entityId: client.id,
      metadata: buildMedicalRecordAuditMetadata(client, `/api/v2/clients/${client.id}/medical-record`),
    })

    return client
  }

  async getFacialPoints(userId, clientId) {
    await this.getClient(userId, clientId)
    return this.clientsRepository.findFacialPoints(clientId)
  }

  async updateFacialPoints(userId, clientId, payloadPoints, req) {
    const currentClient = await this.getClient(userId, clientId)

    if (currentClient.isLocked) {
      assertEditableClient(currentClient)
    }

    const points = await this.clientsRepository.replaceFacialPoints(clientId, payloadPoints)

    await this.auditService.log(req, {
      action: 'API_V2_CLIENT_FACIAL_POINTS_UPDATE',
      entityType: 'Client',
      entityId: clientId,
      metadata: {
        path: `/api/v2/clients/${clientId}/facial-points`,
        pointsCount: payloadPoints.length,
      },
    })

    return points
  }

  async revealClientData(userId, clientId, payload, req) {
    const client = await this.getClient(userId, clientId)

    await this.auditService.log(req, {
      action: 'API_V2_DATA_REVEAL',
      entityType: 'Client',
      entityId: clientId,
      metadata: {
        path: `/api/v2/clients/${clientId}/reveal`,
        reason: payload.reason,
        fields: ['cpf', 'phone']
      }
    })

    return {
      cpf: client.cpf,
      phone: client.phone
    }
  }
}

module.exports = {
  ClientsService,
  normalizeClientPayload,
}
