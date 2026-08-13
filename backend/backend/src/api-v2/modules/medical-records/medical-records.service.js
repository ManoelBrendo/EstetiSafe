const {
  clientDetailInclude,
  assertEditableClient,
  normalizePhotoRecordConsent,
  extractClientPatchFromAnswers,
  extractExplicitClientPatch,
} = require('../../lib/medical-records')
const { httpError } = require('../../lib/http')

class MedicalRecordsService {
  constructor(medicalRecordsRepository, auditService) {
    this.medicalRecordsRepository = medicalRecordsRepository
    this.auditService = auditService
  }

  async getClientRecord(userId, clientId, req) {
    const client = await this.medicalRecordsRepository.findClientWithDetail(userId, clientId, clientDetailInclude)

    if (!client) {
      throw httpError(404, 'Cliente nao encontrado.')
    }

    if (req) {
      const { buildMedicalRecordAuditMetadata } = require('../../lib/medical-records')
      await this.auditService.log(req, {
        action: 'API_V2_MEDICAL_RECORD_VIEW',
        entityType: 'Client',
        entityId: client.id,
        metadata: buildMedicalRecordAuditMetadata(client, `/api/v2/medical-records/by-client/${client.id}`),
      })
    }

    return client
  }

  async getClientSummary(userId, clientId) {
    const client = await this.medicalRecordsRepository.findClientWithDetail(userId, clientId, clientDetailInclude)

    if (!client) {
      throw httpError(404, 'Cliente nao encontrado.')
    }

    return client
  }

  async getAccessState(userId, clientId) {
    const client = await this.medicalRecordsRepository.findClientWithDetail(userId, clientId, clientDetailInclude)

    if (!client) {
      throw httpError(404, 'Cliente nao encontrado.')
    }

    return client
  }

  async getAnamnesisHistory(userId, clientId, req) {
    const client = await this.medicalRecordsRepository.findClientWithDetail(userId, clientId, clientDetailInclude)

    if (!client) {
      throw httpError(404, 'Cliente nao encontrado.')
    }

    if (req) {
      const { buildMedicalRecordAuditMetadata } = require('../../lib/medical-records')
      await this.auditService.log(req, {
        action: 'API_V2_MEDICAL_RECORD_ANAMNESIS_HISTORY_VIEW',
        entityType: 'Client',
        entityId: client.id,
        metadata: buildMedicalRecordAuditMetadata(client, `/api/v2/medical-records/by-client/${client.id}/anamnesis`, {
          historyCount: client.anamneses?.length || 0,
        }),
      })
    }

    return client
  }

  async resolveProfessionalSignature(userId, answers) {
    const clonedAnswers = JSON.parse(JSON.stringify(answers || {}))
    const signatures = clonedAnswers.signatures && typeof clonedAnswers.signatures === 'object'
      ? clonedAnswers.signatures
      : null

    if (!signatures?.professionalId) {
      return clonedAnswers
    }

    const professionalId = Number(signatures.professionalId)
    if (!Number.isInteger(professionalId) || professionalId <= 0) {
      throw httpError(400, 'signatures.professionalId invalido.')
    }

    const professional = await this.medicalRecordsRepository.findProfessionalById(userId, professionalId)

    if (!professional) {
      throw httpError(404, 'Profissional informado na assinatura nao foi encontrado.')
    }

    clonedAnswers.signatures = {
      ...signatures,
      professionalId: professional.id,
      professionalName: professional.name,
    }

    return clonedAnswers
  }

  async upsertAnamnesis(userId, clientId, payload, req) {
    const currentClient = await this.medicalRecordsRepository.findClientWithDetail(userId, clientId, clientDetailInclude)

    if (!currentClient) {
      throw httpError(404, 'Cliente nao encontrado.')
    }

    assertEditableClient(currentClient)

    const resolvedAnswers = await this.resolveProfessionalSignature(userId, payload.answers)
    const finalAnswers = normalizePhotoRecordConsent(resolvedAnswers)

    const clientPatch = {
      ...extractClientPatchFromAnswers(finalAnswers),
      ...extractExplicitClientPatch(payload.client || {}),
    }

    const { client, createdAnamnesis } = await this.medicalRecordsRepository.createAnamnesisVersion({
      clientId,
      answers: finalAnswers,
      clientPatch,
      include: clientDetailInclude,
    })

    if (req) {
      const latestPhotoRecord = finalAnswers.photoRecord || {}
      await this.auditService.log(req, {
        action: 'API_V2_ANAMNESIS_VERSION_CREATE',
        entityType: 'Anamnesis',
        entityId: createdAnamnesis.id,
        metadata: {
          clientId: client.id,
          path: `/api/v2/medical-records/by-client/${client.id}/anamnesis`,
          photoConsent: {
            clinicalUseAuthorized: Boolean(latestPhotoRecord.clinicalUseAuthorized || latestPhotoRecord.imageUseAuthorized),
            marketingUseAuthorized: Boolean(latestPhotoRecord.marketingUseAuthorized || latestPhotoRecord.imageUseAuthorized),
            consentAwarenessConfirmed: Boolean(latestPhotoRecord.consentAwarenessConfirmed),
            photoCount: Array.isArray(latestPhotoRecord.photos) ? latestPhotoRecord.photos.length : 0,
            consentVersion: latestPhotoRecord.consentVersion || null,
          },
        },
      })
    }

    return client
  }
}

module.exports = {
  MedicalRecordsService,
}
