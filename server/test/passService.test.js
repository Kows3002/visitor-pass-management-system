const test = require('node:test');
const assert = require('node:assert/strict');
const passService = require('../src/services/passService');

test('QR verification URL prefers the deployed HTTPS client over localhost', () => {
  const previousPublic = process.env.PUBLIC_APP_URL;
  const previousClient = process.env.CLIENT_URL;
  delete process.env.PUBLIC_APP_URL;
  process.env.CLIENT_URL = 'http://localhost:5173,https://visitor-pass-management-system-five.vercel.app';
  assert.equal(passService.publicAppOrigin(), 'https://visitor-pass-management-system-five.vercel.app');
  assert.equal(
    passService.verificationUrl({ passCode: 'a'.repeat(48) }),
    `https://visitor-pass-management-system-five.vercel.app/pass/verify/${'a'.repeat(48)}`,
  );
  if (previousPublic === undefined) delete process.env.PUBLIC_APP_URL; else process.env.PUBLIC_APP_URL = previousPublic;
  if (previousClient === undefined) delete process.env.CLIENT_URL; else process.env.CLIENT_URL = previousClient;
});
