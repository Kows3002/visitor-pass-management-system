const fs = require('fs/promises')
const Visitor = require('../models/Visitor')
const User = require('../models/User')
const Activity = require('../models/ActivityLog')
const service = require('../services/visitorService')
const activity = require('../services/activityService')
const notifications = require('../services/notificationService')
const AppError = require('../utils/appError')
const { queryDateRange } = require('../utils/dateRange')
const { ok, created } = require('../utils/response')
const passService = require('../services/passService')

const escape = value => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')

exports.create = async (req, res, next) => {
  try {
    const photoUrl = req.file ? `${req.protocol}://${req.get('host')}/uploads/${req.file.filename}` : undefined
    const item = await service.create({ ...req.body, photoUrl }, req.user)
    await activity.record(req, 'created', item._id, req.body.remarks)
    await item.populate('employee', 'name email')
    await item.populate('department', 'name code')
    const notification = await notifications.sendEmployeeAssignmentAlert(item)
    created(res, item, 'Visitor registered and randomly assigned for approval', { notification })
  } catch (error) {
    if (req.file) await fs.unlink(req.file.path).catch(() => {})
    next(error)
  }
}

exports.list = async (req, res, next) => {
  try {
    const { search, status, department, employee, from, to, active, page = 1, limit = 20, sortBy = 'createdAt', sortOrder = 'desc' } = req.query
    const query = {}
    if (req.user.role === 'employee') query.employee = req.user._id
    else if (employee) query.employee = employee
    if (active === 'true') query.status = { $in: ['approved', 'checked_in'] }
    else if (status) query.status = status
    if (department) query.department = department
    if (from || to) query.visitDate = queryDateRange(from, to)

    if (search) {
      const pattern = new RegExp(escape(search), 'i')
      const hostIds = await User.find({ role: 'employee', $or: [{ name: pattern }, { email: pattern }] }).distinct('_id')
      query.$or = ['visitorName', 'phone', 'email', 'companyName', 'purpose'].map(key => ({ [key]: pattern }))
      if (hostIds.length) query.$or.push({ employee: { $in: hostIds } })
    }

    const allowedSorts = ['visitorName', 'visitDate', 'expectedArrival', 'status', 'createdAt']
    const safeSort = allowedSorts.includes(sortBy) ? sortBy : 'createdAt'
    const safeLimit = Math.min(Number(limit), 100)
    const skip = (Number(page) - 1) * safeLimit
    const roleScope = req.user.role === 'employee' ? { employee: req.user._id } : {}
    const [items, total, statusCounts] = await Promise.all([
      Visitor.find(query).populate('employee', 'name email').populate('department', 'name code').populate('reviewedBy', 'name role').sort({ [safeSort]: sortOrder === 'asc' ? 1 : -1 }).skip(skip).limit(safeLimit),
      Visitor.countDocuments(query),
      Visitor.aggregate([{ $match: roleScope }, { $group: { _id: '$status', count: { $sum: 1 } } }]),
    ])
    ok(res, items, 'Visitors loaded', { page: Number(page), limit: safeLimit, total, pages: Math.max(Math.ceil(total / safeLimit), 1), statusCounts: Object.fromEntries(statusCounts.map(item => [item._id, item.count])) })
  } catch (error) {
    next(error)
  }
}

exports.detail = async (req, res, next) => {
  try {
    const filter = { _id: req.params.id }
    if (req.user.role === 'employee') filter.employee = req.user._id
    const item = await Visitor.findOne(filter).populate('employee', 'name email').populate('department', 'name code').populate('createdBy', 'name role').populate('reviewedBy', 'name role')
    if (!item) throw new AppError('Visitor request not found', 404, 'NOT_FOUND')
    ok(res, item, 'Visitor request loaded')
  } catch (error) { next(error) }
}

exports.history = async (req, res, next) => {
  try {
    const visitor = await Visitor.findById(req.params.id).select('employee')
    if (!visitor) throw new AppError('Visitor request not found', 404, 'NOT_FOUND')
    if (req.user.role === 'employee' && String(visitor.employee) !== String(req.user._id)) throw new AppError('This request belongs to another employee', 403, 'FORBIDDEN')
    ok(res, await Activity.find({ visitor: visitor._id }).populate('performedBy', 'name role').sort({ createdAt: -1 }), 'Activity history loaded')
  } catch (error) { next(error) }
}

exports.remark = async (req, res, next) => {
  try {
    const item = await service.addRemark(req.params.id, req.user, req.body.remarks)
    await activity.record(req, 'remarks_added', item._id, req.body.remarks)
    ok(res, item, 'Remark added')
  } catch (error) { next(error) }
}

exports.action = action => async (req, res, next) => {
  try {
    const remarks = req.body?.remarks
    const item = await service.transition(req.params.id, action, req.user, remarks)
    const actionName = { approve: 'approved', reject: 'rejected', cancel: 'cancelled', checkin: 'checked_in', checkout: 'checked_out' }[action]
    await activity.record(req, actionName, item._id, remarks)
    let notification
    if (['approve', 'reject'].includes(action)) {
      await item.populate('employee', 'name email')
      await item.populate('department', 'name code')
      notification = await notifications.sendDecisionNotification(item, actionName)
      if (action === 'approve' && item.email) {
        try {
          const pdf = await passService.generatePdf(item)
          const passNotification = await notifications.sendVisitorPass(item, pdf)
          notification.pass = passNotification
          if (passNotification.status === 'delivered') await item.updateOne({ $set: { passEmailedAt: new Date() } })
        } catch (passError) {
          console.error('[notification] visitor pass generation or delivery failed', { visitorId: String(item._id), error: passError.message })
          notification.pass = { channel: 'email', status: 'failed', reason: 'pass_generation_or_delivery_failed' }
        }
      }
    }
    const message = notification?.status === 'not_delivered'
      ? `Visitor ${actionName}, but no notification was delivered. Check notification configuration and server logs.`
      : `Visitor ${actionName.replace('_', ' ')}`
    ok(res, item, message, notification ? { notification } : undefined)
  } catch (error) { next(error) }
}

exports.confirmArrival = async (req, res, next) => {
  try {
    const item = await service.confirmArrival(req.params.id, req.body.status, req.user)
    await item.populate('employee', 'name email')
    await item.populate('department', 'name code')
    await activity.record(req, req.body.status === 'arrived' ? 'arrival_confirmed' : 'not_arrived', item._id)
    const notification = req.body.status === 'arrived'
      ? await notifications.sendEmployeeAssignmentAlert(item, true)
      : await notifications.sendNotArrivedNotifications(item)
    ok(res, item, `Visitor marked as ${req.body.status.replace('_', ' ')}`, { notification })
  } catch (error) { next(error) }
}

exports.setNextVisit = async (req, res, next) => {
  try {
    const item = await service.setNextVisit(req.params.id, req.body.nextVisitDate, req.user)
    await item.populate('employee', 'name email')
    await activity.record(req, 'next_visit_scheduled', item._id, `Next visit: ${req.body.nextVisitDate}`)
    const notification = await notifications.sendNextVisitNotification(item)
    ok(res, item, 'Next visiting date saved', { notification })
  } catch (error) { next(error) }
}

exports.pass = async (req, res, next) => {
  try { ok(res, await passService.load(req.params.id, req.user), 'Visitor pass loaded') } catch (error) { next(error) }
}

exports.passPdf = async (req, res, next) => {
  try {
    const visitor = await passService.load(req.params.id, req.user)
    const pdf = await passService.generatePdf(visitor)
    res.set({ 'Content-Type': 'application/pdf', 'Content-Disposition': `attachment; filename="${visitor.passNumber}.pdf"`, 'Content-Length': pdf.length }).send(pdf)
  } catch (error) { next(error) }
}
