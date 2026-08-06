const Visitor = require('../models/Visitor')
const mongoose = require('mongoose')
const AppError = require('../utils/appError')

const startOfDay = value => {
  const date = value ? new Date(`${value}T00:00:00`) : new Date()
  if (Number.isNaN(date.getTime())) throw new AppError('Invalid report date', 422, 'INVALID_DATE')
  date.setHours(0, 0, 0, 0)
  return date
}

exports.resolveRange = query => {
  const period = query.period || 'month'
  let from = startOfDay()
  let to = new Date(from)

  if (period === 'today') to.setDate(to.getDate() + 1)
  else if (period === 'yesterday') {
    from.setDate(from.getDate() - 1)
    to = new Date(from)
    to.setDate(to.getDate() + 1)
  } else if (period === 'week') {
    const day = (from.getDay() + 6) % 7
    from.setDate(from.getDate() - day)
    to = new Date(from)
    to.setDate(to.getDate() + 7)
  } else if (period === 'month') {
    from.setDate(1)
    to = new Date(from)
    to.setMonth(to.getMonth() + 1)
  } else if (period === 'custom') {
    if (!query.from || !query.to) throw new AppError('Custom reports require a start and end date', 422, 'DATE_RANGE_REQUIRED')
    from = startOfDay(query.from)
    to = startOfDay(query.to)
    to.setDate(to.getDate() + 1)
    if (from >= to) throw new AppError('Start date must not be after end date', 422, 'INVALID_DATE_RANGE')
    if ((to - from) / 86400000 > 366) throw new AppError('Custom report range cannot exceed 366 days', 422, 'DATE_RANGE_TOO_LARGE')
  } else throw new AppError('Unsupported report period', 422, 'INVALID_PERIOD')

  return { period, from, to, toInclusive: new Date(to.getTime() - 1) }
}

const buildMatch = (query, range) => {
  const match = { visitDate: { $gte: range.from, $lt: range.to } }
  if (query.status) match.status = query.status
  if (query.department) match.department = new mongoose.Types.ObjectId(query.department)
  if (query.employee) match.employee = new mongoose.Types.ObjectId(query.employee)
  return match
}

exports.analytics = async (query, { includeRows = false } = {}) => {
  const range = exports.resolveRange(query)
  const match = buildMatch(query, range)
  const [total, statuses, trends, departments, employees, inside, rows] = await Promise.all([
    Visitor.countDocuments(match),
    Visitor.aggregate([
      { $match: match },
      { $group: { _id: '$status', value: { $sum: 1 } } },
      { $sort: { value: -1 } },
    ]),
    Visitor.aggregate([
      { $match: match },
      { $group: { _id: { $dateToString: { format: '%Y-%m-%d', date: '$visitDate' } }, visitors: { $sum: 1 }, checkIns: { $sum: { $cond: [{ $in: ['$status', ['checked_in', 'checked_out']] }, 1, 0] } } } },
      { $sort: { _id: 1 } },
    ]),
    Visitor.aggregate([
      { $match: match },
      { $group: { _id: '$department', value: { $sum: 1 } } },
      { $sort: { value: -1 } },
      { $lookup: { from: 'departments', localField: '_id', foreignField: '_id', as: 'record' } },
      { $unwind: { path: '$record', preserveNullAndEmptyArrays: true } },
      { $project: { _id: 0, name: { $ifNull: ['$record.name', 'Unassigned'] }, value: 1 } },
    ]),
    Visitor.aggregate([
      { $match: match },
      { $group: { _id: '$employee', value: { $sum: 1 } } },
      { $sort: { value: -1 } },
      { $limit: 10 },
      { $lookup: { from: 'users', localField: '_id', foreignField: '_id', as: 'record' } },
      { $unwind: { path: '$record', preserveNullAndEmptyArrays: true } },
      { $project: { _id: 0, name: { $ifNull: ['$record.name', 'Unknown'] }, value: 1 } },
    ]),
    Visitor.countDocuments({ ...match, status: 'checked_in' }),
    includeRows
      ? Visitor.find(match).populate('employee', 'name email').populate('department', 'name code').sort({ visitDate: -1, expectedArrival: -1 }).limit(10000)
      : Promise.resolve([]),
  ])

  const statusMap = Object.fromEntries(statuses.map(item => [item._id, item.value]))
  return {
    range,
    summary: {
      total,
      approved: (statusMap.approved || 0) + (statusMap.checked_in || 0) + (statusMap.checked_out || 0),
      rejected: statusMap.rejected || 0,
      pending: statusMap.pending || 0,
      cancelled: statusMap.cancelled || 0,
      checkedIn: (statusMap.checked_in || 0) + (statusMap.checked_out || 0),
      checkedOut: statusMap.checked_out || 0,
      inside,
    },
    charts: {
      trends: trends.map(item => ({ date: item._id, visitors: item.visitors, checkIns: item.checkIns })),
      departments,
      employees,
      statuses: statuses.map(item => ({ name: item._id, value: item.value })),
    },
    rows,
  }
}

exports.paginatedRows = async (query, range) => {
  const page = Math.max(+query.page || 1, 1)
  const limit = Math.min(+query.limit || 15, 100)
  const match = buildMatch(query, range)
  const [items, total] = await Promise.all([
    Visitor.find(match).populate('employee', 'name email').populate('department', 'name code').sort({ visitDate: -1, expectedArrival: -1 }).skip((page - 1) * limit).limit(limit),
    Visitor.countDocuments(match),
  ])
  return { items, meta: { page, limit, total, pages: Math.max(Math.ceil(total / limit), 1) } }
}
