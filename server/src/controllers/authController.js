const jwt = require('jsonwebtoken')
const User = require('../models/User')
const ActivityLog = require('../models/ActivityLog')
const AppError = require('../utils/appError')
const { ok } = require('../utils/response')
const env = require('../config/env')

const cookieBase = () => ({
  httpOnly: true,
  secure: env.production,
  sameSite: env.production ? 'none' : 'lax',
  path: '/',
})
const sessionDuration = remember => remember ? 30 * 86400000 : 86400000
const sign = (user, remember) => jwt.sign(
  { sub: user._id.toString(), role: user.role, ver: user.tokenVersion },
  env.jwtSecret,
  {
    algorithm: 'HS256',
    expiresIn: remember ? '30d' : env.jwtExpiresIn,
    issuer: 'visitor-pass-api',
    audience: 'visitor-pass-web',
  },
)

exports.login = async (req, res, next) => {
  try {
    const user = await User.findOne({ email: req.body.email.toLowerCase() }).select('+password +tokenVersion')
    if (!user || !await user.comparePassword(req.body.password) || !user.active) {
      throw new AppError('Invalid email or password', 401, 'INVALID_CREDENTIALS')
    }
    const token = sign(user, req.body.rememberMe)
    res.cookie('auth_token', token, { ...cookieBase(), maxAge: sessionDuration(req.body.rememberMe) })
    await ActivityLog.create({ action: 'login', performedBy: user._id, role: user.role, ipAddress: req.ip })
    user.password = undefined
    user.tokenVersion = undefined
    ok(res, { user }, 'Login successful')
  } catch (error) {
    next(error)
  }
}

exports.profile = (req, res) => ok(res, req.user, 'Profile loaded')

exports.logout = async (req, res, next) => {
  try {
    await User.findByIdAndUpdate(req.user._id, { $inc: { tokenVersion: 1 } })
    res.clearCookie('auth_token', cookieBase())
    ok(res, null, 'Logout successful')
  } catch (error) {
    next(error)
  }
}

exports.changePassword = async (req, res, next) => {
  try {
    const user = await User.findById(req.user._id).select('+password +tokenVersion')
    if (!user) throw new AppError('User account not found', 404, 'NOT_FOUND')
    if (!await user.comparePassword(req.body.currentPassword)) throw new AppError('Current password is incorrect', 400, 'INVALID_CURRENT_PASSWORD')
    if (await user.comparePassword(req.body.newPassword)) throw new AppError('New password must be different from the current password', 400, 'PASSWORD_UNCHANGED')
    user.password = req.body.newPassword
    user.tokenVersion += 1
    await user.save()
    await ActivityLog.create({ action: 'password_changed', performedBy: req.user._id, role: req.user.role, ipAddress: req.ip })
    res.clearCookie('auth_token', cookieBase())
    ok(res, null, 'Password changed. Please sign in again.')
  } catch (error) {
    next(error)
  }
}
