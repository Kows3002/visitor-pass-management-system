const dotenv = require('dotenv')

dotenv.config({ quiet: true })

const nodeEnv = process.env.NODE_ENV || 'development'
const production = nodeEnv === 'production'

const required = name => {
  const value = process.env[name]?.trim()
  if (!value) throw new Error(`${name} is required`)
  return value
}

const parsePort = value => {
  const port = Number(value || 5000)
  if (!Number.isInteger(port) || port < 1 || port > 65535) throw new Error('PORT must be a valid TCP port')
  return port
}

const parseMongoUri = value => {
  const uri = value.trim()
  if (!/^mongodb(?:\+srv)?:\/\//i.test(uri)) throw new Error('MONGODB_URI must start with mongodb:// or mongodb+srv://')
  if (production && /(?:localhost|127\.0\.0\.1|\[::1\])/i.test(uri)) {
    throw new Error('MONGODB_URI cannot use a local database when NODE_ENV=production')
  }
  return uri
}

const parseOrigins = value => [...new Set(value.split(',').map(item => {
  const candidate = item.trim()
  try {
    const url = new URL(candidate)
    if (!['http:', 'https:'].includes(url.protocol) || url.origin !== candidate.replace(/\/$/, '')) throw new Error()
    return url.origin
  } catch {
    throw new Error(`CLIENT_URL contains an invalid origin: ${candidate || '(empty)'}`)
  }
}))]

const jwtSecret = required('JWT_SECRET')
if (production && jwtSecret.length < 32) throw new Error('JWT_SECRET must contain at least 32 characters in production')

module.exports = Object.freeze({
  nodeEnv,
  production,
  port: parsePort(process.env.PORT),
  mongoUri: parseMongoUri(required('MONGODB_URI')),
  jwtSecret,
  jwtExpiresIn: process.env.JWT_EXPIRES_IN?.trim() || '8h',
  clientOrigins: parseOrigins(required('CLIENT_URL')),
})
