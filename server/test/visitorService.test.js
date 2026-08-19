const test = require('node:test');
const assert = require('node:assert/strict');
const Visitor = require('../src/models/Visitor');
const service = require('../src/services/visitorService');
const assignment = require('../src/services/assignmentService');
const settings = require('../src/services/settingService');
const { localDateKey } = require('../src/utils/dateRange');

const originals = {
  visitorExists: Visitor.exists,
  visitorCount: Visitor.countDocuments,
  visitorCreate: Visitor.create,
  visitorFindById: Visitor.findById,
  visitorUpdate: Visitor.findOneAndUpdate,
  selectRandomEmployee: assignment.selectRandomEmployee,
  getSettings: settings.get,
};
const restore = () => {
  Visitor.exists = originals.visitorExists;
  Visitor.countDocuments = originals.visitorCount;
  Visitor.create = originals.visitorCreate;
  Visitor.findById = originals.visitorFindById;
  Visitor.findOneAndUpdate = originals.visitorUpdate;
  assignment.selectRandomEmployee = originals.selectRandomEmployee;
  settings.get = originals.getSettings;
};
test.afterEach(restore);

const dateOffset = (days) => {
  const date = new Date();
  date.setDate(date.getDate() + days);
  return localDateKey(date);
};
const data = (overrides = {}) => ({
  visitorName: 'Test Visitor', phone: '+919876543210', email: 'visitor@example.com',
  governmentId: 'gov-100', purpose: 'Project meeting', visitDate: dateOffset(1), expectedArrival: '10:00', ...overrides,
});
const host = {
  department: 'department-1',
  userId: { _id: 'host-user-1', role: 'employee', active: true },
};
const stubHost = (value = host) => { assignment.selectRandomEmployee = async () => ({ profile: value, user: value.userId }); settings.get = async () => ({ meetingDurationMinutes: 30 }); };
const expectCode = async (promise, code) => assert.rejects(promise, (error) => error.code === code);

test('registration rejects a past visit date', async () => {
  await expectCode(service.create(data({ visitDate: dateOffset(-1) }), { _id: 'reception-1' }), 'PAST_VISIT_DATE');
});

test('registration rejects a visitor who already has an active visit', async () => {
  stubHost();
  Visitor.exists = async () => true;
  await expectCode(service.create(data(), { _id: 'reception-1' }), 'ACTIVE_VISIT_EXISTS');
});

test('registration rejects a duplicate identity on the same visit date', async () => {
  stubHost();
  let calls = 0;
  Visitor.exists = async () => ++calls === 2;
  await expectCode(service.create(data(), { _id: 'reception-1' }), 'DUPLICATE_VISIT');
});

test('registration applies the administrator duration and random employee assignment', async () => {
  stubHost();
  Visitor.exists = async () => false;
  let saved;
  Visitor.create = async (value) => { saved = value; return value; };
  await service.create(data({ expectedArrival: '10:00' }), { _id: 'reception-1' });
  assert.equal(saved.employee, 'host-user-1');
  assert.equal(saved.department, 'department-1');
  assert.equal(saved.meetingDurationMinutes, 30);
  assert.equal(saved.expectedDeparture, '10:30');
  assert.equal(saved.assignmentMethod, 'random');
});

test('approval rechecks active-visit exclusivity', async () => {
  Visitor.findById = async () => ({ _id: 'visit-1', status: 'pending', employee: 'host-user-1', governmentId: 'GOV-100', phone: '+919876543210' });
  Visitor.exists = async () => true;
  await expectCode(service.transition('visit-1', 'approve', { _id: 'host-user-1', role: 'employee' }), 'ACTIVE_VISIT_EXISTS');
});

test('rejected visitors cannot check in', async () => {
  Visitor.findById = async () => ({ _id: 'visit-1', status: 'rejected', employee: 'host-user-1' });
  await expectCode(service.transition('visit-1', 'checkin', { _id: 'reception-1', role: 'receptionist' }), 'CHECKIN_NOT_ALLOWED');
});

test('approved visitors require receptionist arrival confirmation before check-in', async () => {
  Visitor.findById = async () => ({ _id: 'visit-1', status: 'approved', arrivalStatus: 'unconfirmed', employee: 'host-user-1' });
  await expectCode(service.transition('visit-1', 'checkin', { _id: 'reception-1', role: 'receptionist' }), 'ARRIVAL_CONFIRMATION_REQUIRED');
});

test('a checked-in visitor cannot check in again', async () => {
  Visitor.findById = async () => ({ _id: 'visit-1', status: 'checked_in', employee: 'host-user-1' });
  await expectCode(service.transition('visit-1', 'checkin', { _id: 'reception-1', role: 'receptionist' }), 'INVALID_TRANSITION');
});

test('checkout explicitly requires a time later than check-in', async () => {
  Visitor.findById = async () => ({ _id: 'visit-1', status: 'checked_in', checkedInAt: new Date(Date.now() + 60000) });
  await expectCode(service.transition('visit-1', 'checkout', { _id: 'reception-1', role: 'receptionist' }), 'INVALID_CHECKOUT_TIME');
});

test('successful check-in uses an atomic approved-status transition and records the timestamp', async () => {
  Visitor.findById = async () => ({ _id: 'visit-1', status: 'approved', arrivalStatus: 'arrived', employee: 'host-user-1' });
  let filter;
  let update;
  Visitor.findOneAndUpdate = async (nextFilter, nextUpdate) => {
    filter = nextFilter;
    update = nextUpdate;
    return { _id: 'visit-1', status: 'checked_in' };
  };
  await service.transition('visit-1', 'checkin', { _id: 'reception-1', role: 'receptionist' });
  assert.deepEqual(filter.status, { $in: ['approved'] });
  assert.ok(update.$set.checkedInAt instanceof Date);
  assert.equal(update.$set.status, 'checked_in');
});
