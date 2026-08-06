const express = require('express')
const path = require('path')
const helmet = require('helmet')
const cors = require('cors')
const morgan = require('morgan')
const cookieParser = require('cookie-parser')
const sanitize = require('./middleware/sanitize')
const { notFound, handler } = require('./middleware/error')

const app = express()
app.set('trust proxy', 1)
app.set('etag', false)

const normalizeOrigin = value => {
    try {
        return new URL(value.trim()).origin
    } catch {
        return null
    }
}

const allowedOrigins = (process.env.CLIENT_URL || 'http://localhost:5173')
    .split(',')
    .map(normalizeOrigin)
    .filter(Boolean)

const corsOptions = {
    origin(origin, callback) {
        if (!origin || allowedOrigins.includes(normalizeOrigin(origin))) return callback(null, true)
        return callback(new Error(`Origin ${origin} is not allowed by CORS`))
    },
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization', 'Cache-Control'],
    maxAge: 86400,
}

app.use(helmet({ crossOriginResourcePolicy: { policy: 'cross-origin' } }))
app.use(cors(corsOptions))
app.use(express.json({ limit: '1mb' }))
app.use(express.urlencoded({ extended: false }))
app.use(cookieParser())
app.use('/uploads', express.static(path.join(__dirname, '../uploads'), { maxAge: '1d' }))
app.use('/api', (_req, res, next) => {
    res.set('Cache-Control', 'no-store, no-cache, must-revalidate, private')
    next()
})
app.use(sanitize)
app.use(morgan(process.env.NODE_ENV === 'production' ? 'combined' : 'dev'))

app.get('/api/health', (_req, res) => res.json({ success: true, data: { status: 'healthy', timestamp: new Date() } }))
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
