const { createApp } = require('./app')
const { env } = require('./config/env')
const { prisma } = require('./lib/prisma')

const app = createApp()
const server = app.listen(env.port, () => {
  console.log(`[future-api] ouvindo na porta ${env.port}`)
})

async function shutdown(signal) {
  console.log(`[future-api] encerrando apos ${signal}`)
  await prisma.$disconnect()
  server.close(() => process.exit(0))
}

process.on('SIGINT', () => shutdown('SIGINT'))
process.on('SIGTERM', () => shutdown('SIGTERM'))
