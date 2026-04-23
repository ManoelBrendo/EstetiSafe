const path = require('path')
const dotenv = require('dotenv')

dotenv.config({
  path: process.env.FUTURE_API_ENV_FILE || path.join(__dirname, '..', '..', '.env'),
})

function toNumber(value, fallback) {
  const parsed = Number(value)
  return Number.isFinite(parsed) ? parsed : fallback
}

const env = {
  nodeEnv: process.env.NODE_ENV || 'development',
  port: toNumber(process.env.PORT, 3100),
  databaseUrl: process.env.DATABASE_URL || '',
  jwtSecret: process.env.JWT_SECRET || '',
  logLevel: process.env.LOG_LEVEL || 'info',
}

module.exports = {
  env,
}
