const { anamnesisUpsertSchema } = require('../../schemas')
const { parsePositiveInt } = require('../../lib/http')
const {
  buildMedicalRecord,
  buildMedicalRecordSummary,
  buildAccessState,
  summarizeAnamnesis,
} = require('../../lib/medical-records')

class MedicalRecordsController {
  constructor(medicalRecordsService) {
    this.medicalRecordsService = medicalRecordsService
  }

  async getRecord(req, res) {
    const clientId = parsePositiveInt(req.params.clientId, 'clientId')
    const client = await this.medicalRecordsService.getClientRecord(req.currentUser.id, clientId, req)
    res.json(buildMedicalRecord(client))
  }

  async getSummary(req, res) {
    const clientId = parsePositiveInt(req.params.clientId, 'clientId')
    const client = await this.medicalRecordsService.getClientSummary(req.currentUser.id, clientId)
    res.json(buildMedicalRecordSummary(client))
  }

  async getAccessState(req, res) {
    const clientId = parsePositiveInt(req.params.clientId, 'clientId')
    const client = await this.medicalRecordsService.getAccessState(req.currentUser.id, clientId)
    res.json({
      medicalRecordId: `legacy-client-${client.id}`,
      ...buildAccessState(client),
    })
  }

  async getAnamnesis(req, res) {
    const clientId = parsePositiveInt(req.params.clientId, 'clientId')
    const client = await this.medicalRecordsService.getAnamnesisHistory(req.currentUser.id, clientId, req)
    res.json({
      clientId: client.id,
      latest: summarizeAnamnesis(client.anamneses?.[0] || null),
      history: (client.anamneses || []).map(summarizeAnamnesis),
      accessState: buildAccessState(client),
    })
  }

  async putAnamnesis(req, res) {
    const clientId = parsePositiveInt(req.params.clientId, 'clientId')
    const payload = anamnesisUpsertSchema.parse(req.body)
    const client = await this.medicalRecordsService.upsertAnamnesis(req.currentUser.id, clientId, payload, req)
    res.json(buildMedicalRecord(client))
  }
}

module.exports = {
  MedicalRecordsController,
}
