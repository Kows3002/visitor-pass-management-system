const express = require('express')
const path = require('path')
const helmet = require('helmet')
const cors = require('cors')
const morgan = require('morgan')
const cookieParser = require('cookie-parser')
const env = require('./config/env')
const { ok } = require('./utils/response')
const sanitize = require('./middleware/sanitize')
const { notFound, handler } = require('./middleware/error')

const app = express()
app.set('trust proxy', 1)
app.set('etag', false)

const corsOptions = {
    origin(origin, callback) {
        if (!origin || env.clientOrigins.includes(origin)) return callback(null, true)
        return callback(new Error(`Origin ${origin} is not allowed by CORS`))
    },
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization', 'Cache-Control'],
    optionsSuccessStatus: 204,
    preflightContinue: false,
    maxAge: 86400,
}

app.use(helmet({ crossOriginResourcePolicy: { policy: 'cross-origin' } }))
app.use(cors(corsOptions))
app.options('/{*path}', cors(corsOptions))
app.use(express.json({ limit: '1mb' }))
app.use(express.urlencoded({ extended: false }))
app.use(cookieParser())
app.use('/uploads', express.static(path.join(__dirname, '../uploads'), { maxAge: '1d' }))
app.use('/api', (_req, res, next) => {
    res.set('Cache-Control', 'no-store, no-cache, must-revalidate, private')
    next()
})
app.use(sanitize)
app.use(morgan(env.production ? 'combined' : 'dev'))

app.get('/api/health', (_req, res) => ok(res, { status: 'healthy', timestamp: new Date() }, 'API is healthy'))
app.use('/api/auth', require('./routes/authRoutes'))
app.use('/api/users', require('./routes/userRoutes'))
app.use('/api/employees', require('./routes/employeeRoutes'))
app.use('/api/departments', require('./routes/departmentRoutes'))
app.use('/api/visitors', require('./routes/visitorRoutes'))
app.use('/api/reports', require('./routes/reportRoutes'))
app.use('/api/activities', require('./routes/activityRoutes'))
app.use('/api', require('./routes/metaRoutes'))
app.use(notFound)
app.use(handler)

module.exports = app
