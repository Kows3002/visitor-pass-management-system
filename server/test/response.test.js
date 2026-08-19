const test = require('node:test');
const assert = require('node:assert/strict');
const response = require('../src/utils/response');

const mockResponse = () => ({
  statusCode: 0,
  body: null,
  status(code) { this.statusCode = code; return this; },
  json(payload) { this.body = payload; return this; },
});

test('success responses use the standard success, message, data, and meta shape', () => {
  const res = mockResponse();
  response.ok(res, [{ id: 1 }], 'Records loaded', { page: 1 });
  assert.equal(res.statusCode, 200);
  assert.deepEqual(res.body, { success: true, message: 'Records loaded', data: [{ id: 1 }], meta: { page: 1 } });
});

test('error responses use the standard success, message, code, and errors shape', () => {
  const res = mockResponse();
  response.fail(res, 422, 'Validation failed', 'VALIDATION_ERROR', [{ path: 'email', msg: 'Invalid email' }]);
  assert.equal(res.statusCode, 422);
  assert.deepEqual(res.body, {
    success: false,
    message: 'Validation failed',
    code: 'VALIDATION_ERROR',
    errors: [{ path: 'email', msg: 'Invalid email' }],
  });
});
