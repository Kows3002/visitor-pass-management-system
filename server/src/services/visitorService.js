const Visitor = require('../models/Visitor');
const AppError = require('../utils/appError');
const { localDateKey, localDayRange } = require('../utils/dateRange');
const assignment = require('./assignmentService');
const settings = require('./settingService');

const ACTIVE_STATUSES = ['approved', 'checked_in'];
const dayBounds = (value) => {
  const { start, end } = localDayRange(value);
  return [start, end];
};
const identityFilter = (visitor) => ({
  $or: [
    { governmentId: String(visitor.governmentId).trim().toUpperCase() },
    { phone: String(visitor.phone).trim() },
  ],
});

exports.create = async (data, user) => {
  const [start, end] = dayBounds(data.visitDate);
  const [today] = dayBounds(localDateKey());
  if (start < today) throw new AppError('Visit date cannot be earlier than today', 422, 'PAST_VISIT_DATE');
  if (+start === +today && new Date(`${String(data.visitDate).slice(0, 10)}T${data.expectedArrival}:00`) < new Date()) {
    throw new AppError("Today's arrival time cannot be earlier than the current time", 422, 'PAST_ARRIVAL_TIME');
  }

  const identity = identityFilter(data);
  if (await Visitor.exists({ ...identity, status: { $in: ACTIVE_STATUSES } })) {
    throw new AppError('This visitor already has an active visit', 409, 'ACTIVE_VISIT_EXISTS');
  }
  if (await Visitor.exists({ ...identity, visitDate: { $gte: start, $lt: end } })) {
    throw new AppError('This visitor is already registered for the selected date', 409, 'DUPLICATE_VISIT');
  }
  const [{ profile: host, user: hostUser }, operations] = await Promise.all([assignment.selectRandomEmployee(), settings.get()]);
  const scheduledStart = new Date(`${String(data.visitDate).slice(0, 10)}T${data.expectedArrival}:00`);
  const scheduledEndAt = new Date(scheduledStart.getTime() + operations.meetingDurationMinutes * 60000);
  const expectedDeparture = `${String(scheduledEndAt.getHours()).padStart(2, '0')}:${String(scheduledEndAt.getMinutes()).padStart(2, '0')}`;
  return Visitor.create({
    ...data,
    governmentId: String(data.governmentId).trim().toUpperCase(),
    phone: String(data.phone).trim(),
    employee: hostUser._id,
    department: host.department,
    visitDate: start,
    expectedDeparture,
    scheduledEndAt,
    meetingDurationMinutes: operations.meetingDurationMinutes,
    assignmentMethod: 'random',
    assignedAt: new Date(),
    createdBy: user._id,
  });
};

exports.transition = async (id, action, user, remarks) => {
  const rules = {
    approve: { from: ['pending'], to: 'approved' },
    reject: { from: ['pending'], to: 'rejected' },
    cancel: { from: ['pending', 'approved'], to: 'cancelled' },
    checkin: { from: ['approved'], to: 'checked_in' },
    checkout: { from: ['checked_in'], to: 'checked_out' },
  };
  const rule = rules[action];
  if (!rule) throw new AppError('Unsupported visitor action', 400, 'INVALID_ACTION');

  const current = await Visitor.findById(id);
  if (!current) throw new AppError('Visitor request not found', 404, 'NOT_FOUND');
  if (['approve', 'reject'].includes(action) && user.role === 'employee' && String(current.employee) !== String(user._id)) {
    throw new AppError('This request belongs to another employee', 403, 'FORBIDDEN');
  }
  if (!rule.from.includes(current.status)) {
    if (action === 'checkin' && ['rejected', 'cancelled'].includes(current.status)) {
      throw new AppError(`${current.status === 'rejected' ? 'Rejected' : 'Cancelled'} visitors cannot check in`, 409, 'CHECKIN_NOT_ALLOWED');
    }
    throw new AppError(`Cannot ${action} a ${current.status.replace('_', ' ')} visit`, 409, 'INVALID_TRANSITION');
  }
  if (action === 'checkin' && current.arrivalStatus !== 'arrived') {
    throw new AppError('Reception must confirm that the visitor has arrived before check-in', 409, 'ARRIVAL_CONFIRMATION_REQUIRED');
  }
  if (action === 'approve') {
    const otherActiveVisit = await Visitor.exists({
      _id: { $ne: current._id },
      ...identityFilter(current),
      status: { $in: ACTIVE_STATUSES },
    });
    if (otherActiveVisit) throw new AppError('This visitor already has an active visit', 409, 'ACTIVE_VISIT_EXISTS');
  }

  const now = new Date();
  if (action === 'checkout' && (!current.checkedInAt || now <= current.checkedInAt)) {
    throw new AppError('Check-out time must be later than check-in time', 409, 'INVALID_CHECKOUT_TIME');
  }
  const filter = { _id: id, status: { $in: rule.from } };
  if (['approve', 'reject'].includes(action) && user.role === 'employee') filter.employee = user._id;
  if (action === 'checkout') filter.checkedInAt = { $lt: now };
  const set = { status: rule.to };
  if (remarks) set.remarks = remarks.trim();
  if (['approve', 'reject'].includes(action)) {
    set.reviewedBy = user._id;
    set.reviewedAt = now;
  }
  if (action === 'checkin') set.checkedInAt = now;
  if (action === 'checkout') set.checkedOutAt = now;

  const visit = await Visitor.findOneAndUpdate(filter, { $set: set }, { returnDocument: 'after', runValidators: true });
  if (visit) return visit;
  throw new AppError('The visitor status changed while this action was being processed. Refresh and try again.', 409, 'CONCURRENT_TRANSITION');
};

exports.confirmArrival = async (id, status, user) => {
  const current = await Visitor.findById(id);
  if (!current) throw new AppError('Visitor request not found', 404, 'NOT_FOUND');
  const { start, end } = localDayRange();
  if (current.visitDate < start || current.visitDate >= end) throw new AppError('Arrival can only be confirmed on the scheduled visit date', 409, 'NOT_SCHEDULED_TODAY');
  if (!['approved', 'pending'].includes(current.status)) throw new AppError('Arrival cannot be updated for this visitor status', 409, 'INVALID_ARRIVAL_STATUS');
  return Visitor.findOneAndUpdate(
    { _id: id, status: current.status },
    { $set: { arrivalStatus: status, arrivalConfirmedAt: new Date(), arrivalConfirmedBy: user._id } },
    { returnDocument: 'after', runValidators: true },
  );
};

exports.setNextVisit = async (id, date, user) => {
  const current = await Visitor.findById(id);
  if (!current) throw new AppError('Visitor request not found', 404, 'NOT_FOUND');
  if (user.role === 'employee' && String(current.employee) !== String(user._id)) throw new AppError('This request belongs to another employee', 403, 'FORBIDDEN');
  const { start } = localDayRange(date);
  const { start: tomorrow } = localDayRange(new Date(Date.now() + 86400000));
  if (start < tomorrow) throw new AppError('Next visiting date must be a future date', 422, 'INVALID_NEXT_VISIT_DATE');
  return Visitor.findByIdAndUpdate(id, { $set: { nextVisitDate: start, nextVisitSetBy: user._id } }, { returnDocument: 'after', runValidators: true });
};

exports.addRemark = async (id, user, remarks) => {
  const filter = { _id: id };
  if (user.role === 'employee') filter.employee = user._id;
  const visit = await Visitor.findOneAndUpdate(filter, { $set: { remarks: remarks.trim() } }, { returnDocument: 'after', runValidators: true });
  if (visit) return visit;
  if (!await Visitor.exists({ _id: id })) throw new AppError('Visitor request not found', 404, 'NOT_FOUND');
  throw new AppError('This request belongs to another employee', 403, 'FORBIDDEN');
};
