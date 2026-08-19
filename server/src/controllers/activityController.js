const ActivityLog = require('../models/ActivityLog');
const User = require('../models/User');
const Visitor = require('../models/Visitor');
const AppError = require('../utils/appError');
const { ok } = require('../utils/response');

const escapeRegex = (value) => String(value).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const csvCell = (value) => `"${String(value ?? '').replaceAll('"', '""')}"`;

const buildFilter = async (req) => {
  const scope = req.user.role === 'administrator' ? {} : { performedBy: req.user._id };
  const filter = { ...scope };
  if (req.query.action) filter.action = req.query.action;
  if (req.query.role && req.user.role === 'administrator') filter.role = req.query.role;
  if (req.query.from || req.query.to) {
    filter.createdAt = {};
    if (req.query.from) filter.createdAt.$gte = new Date(`${req.query.from}T00:00:00`);
    if (req.query.to) filter.createdAt.$lte = new Date(`${req.query.to}T23:59:59.999`);
    if (filter.createdAt.$gte && filter.createdAt.$lte && filter.createdAt.$gte > filter.createdAt.$lte) {
      throw new AppError('Start date must not be after end date', 422, 'INVALID_DATE_RANGE');
    }
  }
  if (req.query.search) {
    const pattern = new RegExp(escapeRegex(req.query.search.trim()), 'i');
    const [users, visitors] = await Promise.all([
      User.find({ $or: [{ name: pattern }, { email: pattern }] }).select('_id').limit(100),
      Visitor.find({ $or: [{ visitorName: pattern }, { companyName: pattern }] }).select('_id').limit(100),
    ]);
    filter.$or = [
      { performedBy: { $in: users.map((item) => item._id) } },
      { visitor: { $in: visitors.map((item) => item._id) } },
      { remarks: pattern }, { 'metadata.targetName': pattern }, { 'metadata.targetEmail': pattern },
    ];
  }
  return { scope, filter };
};

exports.list = async (req, res, next) => {
  try {
    const page = Math.max(Number(req.query.page) || 1, 1);
    const limit = Math.min(Math.max(Number(req.query.limit) || 20, 1), 100);
    const { scope, filter } = await buildFilter(req);
    const [items, total, facets] = await Promise.all([
      ActivityLog.find(filter).populate('performedBy', 'name email role').populate('visitor', 'visitorName companyName status').sort({ createdAt: -1 }).skip((page - 1) * limit).limit(limit).lean(),
      ActivityLog.countDocuments(filter),
      ActivityLog.aggregate([{ $match: scope }, { $group: { _id: '$action', count: { $sum: 1 } } }, { $sort: { count: -1 } }]),
    ]);
    ok(res, items, 'Activity history loaded', {
      page, limit, total, pages: Math.max(Math.ceil(total / limit), 1),
      actionCounts: Object.fromEntries(facets.map((item) => [item._id, item.count])),
    });
  } catch (error) { next(error); }
};

exports.exportCsv = async (req, res, next) => {
  try {
    const { filter } = await buildFilter(req);
    const items = await ActivityLog.find(filter)
      .populate('performedBy', 'name email role')
      .populate('visitor', 'visitorName companyName status')
      .sort({ createdAt: -1 })
      .limit(10000)
      .lean();
    const headings = ['Timestamp', 'Action', 'Performed By', 'Email', 'Role', 'Visitor / Employee', 'Visitor Status', 'Remarks', 'IP Address'];
    const rows = items.map((item) => [
      new Date(item.createdAt).toISOString(), item.action, item.performedBy?.name || 'Unknown user',
      item.performedBy?.email || '', item.role, item.visitor?.visitorName || item.metadata?.targetName || '',
      item.visitor?.status || '', item.remarks || '', item.ipAddress || '',
    ]);
    const csv = `\uFEFF${[headings, ...rows].map((row) => row.map(csvCell).join(',')).join('\r\n')}`;
    res.set({
      'Content-Type': 'text/csv; charset=utf-8',
      'Content-Disposition': `attachment; filename="activity-audit-${new Date().toISOString().slice(0, 10)}.csv"`,
      'Cache-Control': 'no-store',
    });
    return res.status(200).send(csv);
  } catch (error) { return next(error); }
};
