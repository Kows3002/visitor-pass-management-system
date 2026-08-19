const Visitor = require('../models/Visitor');
const Employee = require('../models/Employee');
const Activity = require('../models/ActivityLog');
const { ok } = require('../utils/response');
const { localDayRange: dayRange } = require('../utils/dateRange');

const DAY = 86400000;
const TIMEZONE = process.env.APP_TIMEZONE || 'Asia/Kolkata';

const monthStart = (offset = 0) => {
  const date = new Date();
  date.setMonth(date.getMonth() - offset, 1);
  date.setHours(0, 0, 0, 0);
  return date;
};

const weekStart = (offset = 0) => {
  const date = new Date();
  const weekday = date.getDay() || 7;
  date.setDate(date.getDate() - weekday + 1 - (offset * 7));
  date.setHours(0, 0, 0, 0);
  return date;
};

const localDateKey = (date) => [date.getFullYear(), String(date.getMonth() + 1).padStart(2, '0'), String(date.getDate()).padStart(2, '0')].join('-');

const fillMonths = (rows, total = 12) => {
  const values = new Map(rows.map((row) => [row._id, row]));
  return Array.from({ length: total }, (_, index) => {
    const date = monthStart(total - index - 1);
    const key = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
    const row = values.get(key) || {};
    return { month: key, visitors: row.visitors || 0, approved: row.approved || 0, rejected: row.rejected || 0 };
  });
};

const fillWeeks = (rows, total = 12) => {
  const values = new Map(rows.map((row) => [row._id, row.registrations]));
  return Array.from({ length: total }, (_, index) => {
    const key = localDateKey(weekStart(total - index - 1));
    return { week: key, registrations: values.get(key) || 0 };
  });
};

const loadAdminAnalytics = async () => {
  const notCancelled = { status: { $ne: 'cancelled' } };
  const [monthly, weekly, decisions, movement, topEmployees, departments] = await Promise.all([
    Visitor.aggregate([
      { $match: { ...notCancelled, visitDate: { $gte: monthStart(11) } } },
      { $group: {
        _id: { $dateToString: { format: '%Y-%m', date: '$visitDate', timezone: TIMEZONE } },
        visitors: { $sum: 1 },
        approved: { $sum: { $cond: [{ $in: ['$status', ['approved', 'checked_in', 'checked_out']] }, 1, 0] } },
        rejected: { $sum: { $cond: [{ $eq: ['$status', 'rejected'] }, 1, 0] } },
      } },
      { $sort: { _id: 1 } },
    ]),
    Visitor.aggregate([
      { $match: { ...notCancelled, createdAt: { $gte: weekStart(11) } } },
      { $group: {
        _id: { $dateToString: {
          format: '%Y-%m-%d',
          date: { $dateTrunc: { date: '$createdAt', unit: 'week', startOfWeek: 'monday', timezone: TIMEZONE } },
          timezone: TIMEZONE,
        } },
        registrations: { $sum: 1 },
      } },
      { $sort: { _id: 1 } },
    ]),
    Visitor.aggregate([
      { $match: { status: { $in: ['approved', 'rejected', 'checked_in', 'checked_out'] } } },
      { $group: {
        _id: null,
        approved: { $sum: { $cond: [{ $in: ['$status', ['approved', 'checked_in', 'checked_out']] }, 1, 0] } },
        rejected: { $sum: { $cond: [{ $eq: ['$status', 'rejected'] }, 1, 0] } },
      } },
    ]),
    Visitor.aggregate([
      { $match: { status: { $in: ['checked_in', 'checked_out'] } } },
      { $group: {
        _id: null,
        checkedIn: { $sum: { $cond: [{ $ne: [{ $ifNull: ['$checkedInAt', null] }, null] }, 1, 0] } },
        checkedOut: { $sum: { $cond: [{ $ne: [{ $ifNull: ['$checkedOutAt', null] }, null] }, 1, 0] } },
        inside: { $sum: { $cond: [{ $eq: ['$status', 'checked_in'] }, 1, 0] } },
      } },
    ]),
    Visitor.aggregate([
      { $match: notCancelled },
      { $group: { _id: '$employee', visits: { $sum: 1 } } },
      { $sort: { visits: -1 } }, { $limit: 7 },
      { $lookup: { from: 'users', localField: '_id', foreignField: '_id', as: 'employee' } },
      { $unwind: '$employee' },
      { $project: { _id: 0, name: '$employee.name', visits: 1 } },
    ]),
    Visitor.aggregate([
      { $match: notCancelled },
      { $group: { _id: '$department', visits: { $sum: 1 } } },
      { $sort: { visits: -1 } },
      { $lookup: { from: 'departments', localField: '_id', foreignField: '_id', as: 'department' } },
      { $unwind: '$department' },
      { $project: { _id: 0, name: '$department.name', visits: 1 } },
    ]),
  ]);
  return {
    monthly: fillMonths(monthly), weekly: fillWeeks(weekly),
    decisions: decisions[0] || { approved: 0, rejected: 0 },
    movement: movement[0] || { checkedIn: 0, checkedOut: 0, inside: 0 },
    topEmployees, departments,
  };
};

exports.summary = async (req, res, next) => {
  try {
    const { start, end } = dayRange();
    const role = req.user.role;
    const scope = role === 'employee' ? { employee: req.user._id } : {};
    const todayScope = { ...scope, visitDate: { $gte: start, $lt: end } };
    const reviewedToday = { ...scope, reviewedAt: { $gte: start, $lt: end } };
    const countsPromise = role === 'administrator' ? Promise.all([
      Employee.countDocuments({ status: 'active' }),
      Visitor.countDocuments({ ...todayScope, status: { $ne: 'cancelled' } }),
      Visitor.countDocuments({ status: 'checked_in' }), Visitor.countDocuments({ status: 'pending' }),
      Visitor.countDocuments({ checkedInAt: { $gte: start, $lt: end } }),
      Visitor.countDocuments({ ...reviewedToday, status: { $in: ['approved', 'checked_in', 'checked_out'] } }),
    ]) : role === 'receptionist' ? Promise.all([
      Visitor.countDocuments({ ...todayScope, status: { $ne: 'cancelled' } }),
      Visitor.countDocuments({ ...todayScope, status: { $in: ['pending', 'approved'] } }),
      Visitor.countDocuments({ ...todayScope, status: 'approved' }),
      Visitor.countDocuments({ checkedOutAt: { $gte: start, $lt: end } }), Visitor.countDocuments({ status: 'checked_in' }),
    ]) : Promise.all([
      Visitor.countDocuments({ ...scope, status: 'pending' }),
      Visitor.countDocuments({ ...reviewedToday, status: 'approved' }), Visitor.countDocuments({ ...reviewedToday, status: 'rejected' }),
    ]);
    const [countValues, schedule, monthlyRows, daily, statuses, activities, analytics] = await Promise.all([
      countsPromise,
      Visitor.find({ ...todayScope, status: { $ne: 'cancelled' } }).populate('employee', 'name email').populate('department', 'name code').sort({ expectedArrival: 1 }).limit(12),
      role === 'administrator' ? Promise.resolve([]) : Visitor.aggregate([
        { $match: { ...scope, visitDate: { $gte: monthStart(5) } } },
        { $group: { _id: { $dateToString: { format: '%Y-%m', date: '$visitDate', timezone: TIMEZONE } }, visitors: { $sum: 1 }, approved: { $sum: { $cond: [{ $in: ['$status', ['approved', 'checked_in', 'checked_out']] }, 1, 0] } } } },
        { $sort: { _id: 1 } },
      ]),
      Visitor.aggregate([{ $match: { ...scope, checkedInAt: { $gte: new Date(Date.now() - (7 * DAY)) } } }, { $group: { _id: { $dateToString: { format: '%Y-%m-%d', date: '$checkedInAt', timezone: TIMEZONE } }, value: { $sum: 1 } } }, { $sort: { _id: 1 } }]),
      Visitor.aggregate([{ $match: scope }, { $group: { _id: '$status', value: { $sum: 1 } } }]),
      Activity.find(role === 'employee' ? { performedBy: req.user._id } : {}).populate('performedBy', 'name role').populate('visitor', 'visitorName status').sort({ createdAt: -1 }).limit(8),
      role === 'administrator' ? loadAdminAnalytics() : Promise.resolve(null),
    ]);
    const keys = role === 'administrator' ? ['totalEmployees', 'todayVisitors', 'visitorsInside', 'pendingRequests', 'todayCheckIns', 'approvedToday'] : role === 'receptionist' ? ['todayVisitors', 'scheduledVisitors', 'pendingCheckIns', 'todayCheckOuts', 'visitorsInside'] : ['pendingApprovals', 'approvedToday', 'rejectedToday'];
    const counts = Object.fromEntries(keys.map((key, index) => [key, countValues[index]]));
    const commonCharts = { daily: daily.map((row) => ({ date: row._id, value: row.value })), statuses: statuses.map((row) => ({ name: row._id, value: row.value })) };
    const charts = role === 'administrator' ? { ...analytics, ...commonCharts } : { monthly: monthlyRows.map((row) => ({ month: row._id, visitors: row.visitors, approved: row.approved })), topEmployees: [], ...commonCharts };
    ok(res, { role, counts, schedule, activities, charts, generatedAt: new Date() }, 'Dashboard loaded');
  } catch (error) { next(error); }
};
