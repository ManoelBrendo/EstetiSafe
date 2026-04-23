const express = require('express')
const { registerRoutes } = require('./routes')
const { errorHandler, notFoundHandler } = require('./middleware/error-handler')

function createApp() {
  const app = express()

  app.use(express.json({ limit: '8mb' }))

  app.get('/', (req, res) => {
    res.json({
      name: "L'Appui Future API Blueprint",
      status: 'ready-for-evolution',
      note: 'Blueprint salvo no projeto e mantido isolado da API atual.',
    })
  })

  registerRoutes(app)
  app.use(notFoundHandler)
  app.use(errorHandler)

  return app
}

module.exports = {
  createApp,
}
