const Employee = require('../models/Employee');
const User = require('../models/User');
const ActivityLog = require('../models/ActivityLog');
const links = require('../services/employeeLinkService');
const AppError = require('../utils/appError');
const { ok, created } = require('../utils/response');

const escape = (value) => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const audit = (req, action, employee, changes) => ActivityLog.create({
  action,
  performedBy: req.user._id,
  role: req.user.role,
  ipAddress: req.ip,
  metadata: { targetId: employee._id, targetName: employee.fullName, targetEmail: employee.email, changes },
});

exports.list = async (req, res, next) => {
  try {
    const page = Math.max(+req.query.page || 1, 1);
    const limit = Math.min(+req.query.limit || 10, 100);
    const query = {};
    if (req.query.status) query.status = req.query.status;
    if (req.query.department) query.department = req.query.department;
    if (req.query.unlinked === 'true') {
      const unlinked = { $and: [{ $or: [{ userId: null }, { userId: { $exists: false } }] }, { $or: [{ user: null }, { user: { $exists: false } }] }] };
      query.$and = [req.query.include ? { $or: [unlinked, { _id: req.query.include }] } : unlinked];
    }
    if (req.query.search) {
      const search = { $or: ['fullName', 'email', 'phone', 'designation'].map((key) => ({ [key]: { $regex: escape(req.query.search), $options: 'i' } })) };
      query.$and = [...(query.$and || []), search];
    }
    const allowed = ['fullName', 'email', 'designation', 'status', 'createdAt'];
    const sortBy = allowed.includes(req.query.sortBy) ? req.query.sortBy : 'createdAt';
    const sortOrder = req.query.sortOrder === 'asc' ? 1 : -1;
    const [items, total] = await Promise.all([
      Employee.find(query).populate('department', 'name code').populate('userId', 'name email role active').populate('user', 'name email role active').sort({ [sortBy]: sortOrder }).skip((page - 1) * limit).limit(limit),
      Employee.countDocuments(query),
    ]);
    ok(res, items, 'Employees loaded', { page, limit, total, pages: Math.max(Math.ceil(total / limit), 1) });
  } catch (error) { next(error); }
};

exports.create = async (req, res, next) => {
  try {
    if (await Employee.exists({ email: req.body.email })) throw new AppError('An employee with this email already exists', 409, 'EMAIL_EXISTS');
    const employee = await Employee.create({ fullName: req.body.fullName, email: req.body.email, phone: req.body.phone, department: req.body.department, designation: req.body.designation, status: req.body.status });
    if (req.body.userId || req.body.user) await links.link(req.body.userId || req.body.user, employee._id);
    await audit(req, 'employee_created', employee);
    created(res, await Employee.findById(employee._id).populate('department', 'name code').populate('userId', 'name email role active'), 'Employee added');
  } catch (error) { next(error); }
};

exports.update = async (req, res, next) => {
  try {
    const payload = { ...req.body };
    delete payload.user;
    delete payload.userId;
    const employee = await Employee.findByIdAndUpdate(req.params.id, payload, { new: true, runValidators: true });
    if (!employee) throw new AppError('Employee not found', 404, 'NOT_FOUND');
    if (req.body.userId || req.body.user) await links.link(req.body.userId || req.body.user, employee._id);
    else {
      const linked = employee.userId || employee.user;
      if (linked) await User.findByIdAndUpdate(linked, { $set: { department: employee.department, employeeId: employee._id, employee: employee._id } });
    }
    await audit(req, 'employee_updated', employee, Object.keys(payload));
    ok(res, await Employee.findById(employee._id).populate('department', 'name code').populate('userId', 'name email role active'), 'Employee updated');
  } catch (error) { next(error); }
};

exports.remove = async (req, res, next) => {
  try {
    const employee = await Employee.findByIdAndDelete(req.params.id);
    if (!employee) throw new AppError('Employee not found', 404, 'NOT_FOUND');
    await User.updateMany({ $or: [{ employeeId: employee._id }, { employee: employee._id }] }, { $set: { employeeId: null, employee: null, department: null } });
    await audit(req, 'employee_deleted', employee);
    ok(res, null, 'Employee deleted');
  } catch (error) { next(error); }
};
