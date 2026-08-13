const { clientCreateSchema, clientUpdateSchema } = require('../../schemas')
const { pickPagination, buildPaginated, parsePositiveInt } = require('../../lib/http')
const {
  serializeClientListItem,
  serializeClientDetail,
  buildClientOverview,
  buildClientTimeline,
  buildMedicalRecord,
} = require('../../lib/medical-records')

class ClientsController {
  constructor(clientsService) {
    this.clientsService = clientsService
  }

  async list(req, res) {
    const pagination = pickPagination(req.query)
    const search = String(req.query.search || '').trim()

    const { items, total } = await this.clientsService.listClients(req.currentUser.id, { search, pagination })

    res.json(buildPaginated(items.map(serializeClientListItem), total, pagination))
  }

  async create(req, res) {
    const payload = clientCreateSchema.parse(req.body)
    const created = await this.clientsService.createClient(req.currentUser.id, payload, req)

    res.status(201).json(serializeClientDetail(created))
  }

  async get(req, res) {
    const clientId = parsePositiveInt(req.params.id, 'clientId')
    const client = await this.clientsService.getClient(req.currentUser.id, clientId)

    res.json(serializeClientDetail(client))
  }

  async update(req, res) {
    const clientId = parsePositiveInt(req.params.id, 'clientId')
    const payload = clientUpdateSchema.parse(req.body)
    const updated = await this.clientsService.updateClient(req.currentUser.id, clientId, payload, req)

    res.json(serializeClientDetail(updated))
  }

  async overview(req, res) {
    const clientId = parsePositiveInt(req.params.id, 'clientId')
    const client = await this.clientsService.getClient(req.currentUser.id, clientId)

    res.json(buildClientOverview(client))
  }

  async timeline(req, res) {
    const clientId = parsePositiveInt(req.params.id, 'clientId')
    const client = await this.clientsService.getClient(req.currentUser.id, clientId)

    res.json({
      clientId: client.id,
      items: buildClientTimeline(client),
    })
  }

  async medicalRecord(req, res) {
    const clientId = parsePositiveInt(req.params.id, 'clientId')
    const client = await this.clientsService.getMedicalRecord(req.currentUser.id, clientId, req)

    res.json(buildMedicalRecord(client))
  }

  async getFacialPoints(req, res) {
    const clientId = parsePositiveInt(req.params.id, 'clientId')
    const points = await this.clientsService.getFacialPoints(req.currentUser.id, clientId)

    res.json(points.map(p => ({
      id: p.pointId,
      x: p.x,
      y: p.y,
      type: p.type,
      amount: p.amount,
    })))
  }

  async updateFacialPoints(req, res) {
    const clientId = parsePositiveInt(req.params.id, 'clientId')
    const payload = req.body

    if (!Array.isArray(payload)) {
      return res.status(400).json({ error: 'O payload deve ser um array de marcações faciais.' })
    }

    const points = await this.clientsService.updateFacialPoints(req.currentUser.id, clientId, payload, req)

    res.json(points.map(p => ({
      id: p.pointId,
      x: p.x,
      y: p.y,
      type: p.type,
      amount: p.amount,
    })))
  }

  async reveal(req, res) {
    const clientId = parsePositiveInt(req.params.id, 'clientId')
    const { reason } = req.body

    if (!reason || typeof reason !== 'string' || !reason.trim()) {
      return res.status(400).json({ error: 'A justificativa é obrigatória para revelar os dados.' })
    }

    const revealed = await this.clientsService.revealClientData(req.currentUser.id, clientId, { reason }, req)
    res.json(revealed)
  }
}

module.exports = {
  ClientsController,
}
