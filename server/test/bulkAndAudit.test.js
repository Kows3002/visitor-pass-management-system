const test = require('node:test');
const assert = require('node:assert/strict');
const bulkController = require('../src/controllers/bulkVisitorController');
const activityController = require('../src/controllers/activityController');
const visitorService = require('../src/services/visitorService');
const activityService = require('../src/services/activityService');
const notificationService = require('../src/services/notificationService');
const ActivityLog = require('../src/models/ActivityLog');

const response = () => ({
  statusCode: 0, body: null, headers: {},
  status(code) { this.statusCode = code; return this; },
  json(body) { this.body = body; return this; },
  send(body) { this.body = body; return this; },
  set(headers) { this.headers = { ...this.headers, ...headers }; return this; },
});

test('bulk approval returns independent success and business-rule failure results', async (context) => {
  const originals = { transition: visitorService.transition, record: activityService.record, notify: notificationService.sendDecisionNotification };
  context.after(() => Object.assign(visitorService, { transition: originals.transition })
    && Object.assign(activityService, { record: originals.record })
    && Object.assign(notificationService, { sendDecisionNotification: originals.notify }));
  visitorService.transition = async (id) => {
    if (id === 'blocked') throw Object.assign(new Error('Active visit exists'), { code: 'ACTIVE_VISIT_EXISTS' });
    return { _id: id, visitorName: 'Approved Visitor', status: 'approved', async populate() { return this; } };
  };
  activityService.record = async () => ({});
  notificationService.sendDecisionNotification = async () => ({ status: 'delivered' });
  const req = { body: { ids: ['approved', 'blocked'] }, user: { _id: 'admin-1', role: 'administrator' }, ip: '127.0.0.1' };
  const res = response();
  await bulkController.approve(req, res, (error) => { throw error; });
  assert.equal(res.statusCode, 200);
  assert.equal(res.body.data.succeeded, 1);
  assert.equal(res.body.data.failed, 1);
  assert.equal(res.body.data.errors[0].code, 'ACTIVE_VISIT_EXISTS');
});

test('administrator audit export creates a filtered CSV response', async (context) => {
  const originalFind = ActivityLog.find;
  context.after(() => { ActivityLog.find = originalFind; });
  ActivityLog.find = () => {
    const chain = {
      populate() { return chain; }, sort() { return chain; }, limit() { return chain; },
      async lean() { return [{ createdAt: new Date('2026-08-19T10:00:00Z'), action: 'approved', role: 'employee', performedBy: { name: 'Host', email: 'host@example.com' }, visitor: { visitorName: 'Guest', status: 'approved' }, remarks: 'Approved', ipAddress: '127.0.0.1' }]; },
    };
    return chain;
  };
  const req = { query: {}, user: { _id: 'admin-1', role: 'administrator' } };
  const res = response();
  await activityController.exportCsv(req, res, (error) => { throw error; });
  assert.equal(res.statusCode, 200);
  assert.match(res.headers['Content-Type'], /text\/csv/);
  assert.match(res.body, /Guest/);
  assert.match(res.body, /approved/);
});
