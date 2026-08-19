const test = require('node:test');
const assert = require('node:assert/strict');
const Visitor = require('../src/models/Visitor');
const Employee = require('../src/models/Employee');
const service = require('../src/services/visitorService');
const { localDateKey } = require('../src/utils/dateRange');

const originals = {
  visitorExists: Visitor.exists,
  visitorCount: Visitor.countDocuments,
  visitorCreate: Visitor.create,
  visitorFindById: Visitor.findById,
  visitorUpdate: Visitor.findOneAndUpdate,
  employeeFindOne: Employee.findOne,
};
const restore = () => {
  Visitor.exists = originals.visitorExists;
  Visitor.countDocuments = originals.visitorCount;
  Visitor.create = originals.visitorCreate;
  Visitor.findById = originals.visitorFindById;
  Visitor.findOneAndUpdate = originals.visitorUpdate;
  Employee.findOne = originals.employeeFindOne;
};
test.afterEach(restore);

const dateOffset = (days) => {
  const date = new Date();
  date.setDate(date.getDate() + days);
  return localDateKey(date);
};
const data = (overrides = {}) => ({
  visitorName: 'Test Visitor', phone: '+919876543210', email: 'visitor@example.com',
  governmentId: 'gov-100', purpose: 'Project meeting', employee: 'employee-profile-1',
  visitDate: dateOffset(1), expectedArrival: '10:00', expectedDeparture: '11:00', ...overrides,
});
const host = {
  department: 'department-1',
  userId: { _id: 'host-user-1', role: 'employee', active: true },
};
const stubHost = (value = host) => {
  Employee.findOne = () => {
    const query = { populate() { return query; }, then(resolve) { resolve(value); } };
    return query;
  };
};
const expectCode = async (promise, code) => assert.rejects(promise, (error) => error.code === code);

test('registration rejects a past visit date', async () => {
  await expectCode(service.create(data({ visitDate: dateOffset(-1) }), { _id: 'reception-1' }), 'PAST_VISIT_DATE');
});

test('registration rejects an arrival window whose departure is not later', async () => {
  await expectCode(service.create(data({ expectedArrival: '11:00', expectedDeparture: '10:00' }), { _id: 'reception-1' }), 'INVALID_VISIT_WINDOW');
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

test('registration enforces the host pending-request limit', async () => {
  stubHost();
  Visitor.exists = async () => false;
  Visitor.countDocuments = async () => 3;
  await expectCode(service.create(data(), { _id: 'reception-1' }), 'EMPLOYEE_PENDING_LIMIT');
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

test('a checked-in visitor cannot check in again', async () => {
  Visitor.findById = async () => ({ _id: 'visit-1', status: 'checked_in', employee: 'host-user-1' });
  await expectCode(service.transition('visit-1', 'checkin', { _id: 'reception-1', role: 'receptionist' }), 'INVALID_TRANSITION');
});

test('checkout explicitly requires a time later than check-in', async () => {
  Visitor.findById = async () => ({ _id: 'visit-1', status: 'checked_in', checkedInAt: new Date(Date.now() + 60000) });
  await expectCode(service.transition('visit-1', 'checkout', { _id: 'reception-1', role: 'receptionist' }), 'INVALID_CHECKOUT_TIME');
});

test('successful check-in uses an atomic approved-status transition and records the timestamp', async () => {
  Visitor.findById = async () => ({ _id: 'visit-1', status: 'approved', employee: 'host-user-1' });
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
