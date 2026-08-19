const env = require('./config/env')
const connectDB = require('./config/db')
const app = require('./app')
const notifications = require('./services/notificationService')

let server

async function start() {
  await connectDB()
  await notifications.verifyConfiguration()
  server = app.listen(env.port, () => console.log(`API listening on ${env.port}`))
}

const shutdown = signal => {
  console.log(`${signal} received. Closing the API.`)
  if (!server) return process.exit(0)
  server.close(() => process.exit(0))
  setTimeout(() => process.exit(1), 10000).unref()
}

process.on('SIGTERM', () => shutdown('SIGTERM'))
process.on('SIGINT', () => shutdown('SIGINT'))

start().catch(error => {
  console.error(`${error.message}${error.code ? ` [${error.code}]` : ''}`)
  process.exit(1)
})
