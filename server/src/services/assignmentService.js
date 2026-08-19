const Employee = require('../models/Employee');
const Visitor = require('../models/Visitor');
const AppError = require('../utils/appError');
const crypto = require('crypto');

const shuffle = (items) => items
  .map((item) => ({ item, order: crypto.randomInt(0, 0x7fffffff) }))
  .sort((a, b) => a.order - b.order)
  .map(({ item }) => item);

exports.selectRandomEmployee = async () => {
  const profiles = await Employee.find({ status: 'active' })
    .populate('userId', 'name email role active')
    .populate('user', 'name email role active');
  const candidates = profiles.map((profile) => ({ profile, user: profile.userId || profile.user }))
    .filter(({ profile, user }) => profile.department && user?.active && user.role === 'employee');
  if (!candidates.length) throw new AppError('No active employee with a linked account and department is available', 409, 'NO_EMPLOYEE_AVAILABLE');
  const ids = candidates.map(({ user }) => user._id);
  const pending = await Visitor.aggregate([
    { $match: { employee: { $in: ids }, status: 'pending' } },
    { $group: { _id: '$employee', count: { $sum: 1 } } },
  ]);
  const counts = new Map(pending.map((row) => [String(row._id), row.count]));
  const available = candidates.filter(({ user }) => (counts.get(String(user._id)) || 0) < 3);
  if (!available.length) throw new AppError('All employees already have three pending visitor requests', 409, 'EMPLOYEE_PENDING_LIMIT');
  return shuffle(available)[0];
};
