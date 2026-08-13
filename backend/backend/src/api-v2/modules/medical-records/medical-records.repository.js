class MedicalRecordsRepository {
  constructor(prisma) {
    this.prisma = prisma
  }

  async findClientWithDetail(userId, clientId, include) {
    return this.prisma.client.findFirst({
      where: { id: clientId, userId, deletedAt: null },
      include,
    })
  }

  async findProfessionalById(userId, professionalId) {
    return this.prisma.professional.findFirst({
      where: { id: professionalId, userId },
      select: { id: true, name: true },
    })
  }

  async createAnamnesisVersion({ clientId, answers, clientPatch, include }) {
    return this.prisma.$transaction(async tx => {
      if (clientPatch && Object.keys(clientPatch).length > 0) {
        await tx.client.update({
          where: { id: clientId },
          data: clientPatch,
        })
      }

      const createdAnamnesis = await tx.anamnesis.create({
        data: {
          clientId,
          answers,
        },
      })

      const client = await tx.client.findFirst({
        where: { id: clientId, deletedAt: null },
        include,
      })

      return { client, createdAnamnesis }
    })
  }
}

module.exports = {
  MedicalRecordsRepository,
}
