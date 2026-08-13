class ClientsRepository {
  constructor(prisma) {
    this.prisma = prisma
  }

  async findMany({ where, skip, take, orderBy, include }) {
    return this.prisma.client.findMany({ where, skip, take, orderBy, include })
  }

  async count({ where }) {
    return this.prisma.client.count({ where })
  }

  async findFirst(options) {
    return this.prisma.client.findFirst(options)
  }

  async create({ data, include }) {
    return this.prisma.client.create({ data, include })
  }

  async update({ where, data, include }) {
    return this.prisma.client.update({ where, data, include })
  }

  async findFacialPoints(clientId) {
    return this.prisma.facialPoint.findMany({
      where: { clientId },
      orderBy: { id: 'asc' },
    })
  }

  async replaceFacialPoints(clientId, points) {
    return this.prisma.$transaction(async tx => {
      await tx.facialPoint.deleteMany({
        where: { clientId },
      })

      if (points.length > 0) {
        await tx.facialPoint.createMany({
          data: points.map(p => ({
            clientId,
            pointId: p.id,
            x: Number(p.x),
            y: Number(p.y),
            type: p.type,
            amount: Number(p.amount),
          })),
        })
      }

      return tx.facialPoint.findMany({
        where: { clientId },
        orderBy: { id: 'asc' },
      })
    })
  }
}

module.exports = {
  ClientsRepository,
}
