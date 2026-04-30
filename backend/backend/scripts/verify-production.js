require('dotenv').config()

const { validateProductionEnvironment } = require('../lib/production-readiness')

const result = validateProductionEnvironment(process.env, { forceProduction: true })

result.warnings.forEach(warning => console.warn(`[production-readiness] ${warning}`))

if (!result.ok) {
  console.error('Ambiente ainda não está pronto para produção comercial:')
  result.errors.forEach(error => console.error(`- ${error}`))
  process.exit(1)
}

console.log('Ambiente aprovado no preflight de produção comercial.')