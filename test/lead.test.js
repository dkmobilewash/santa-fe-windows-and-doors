// Tests for api/lead.js with a mock req/res and a mocked fetch. Run: npm test
const test = require('node:test');
const assert = require('node:assert');
const handler = require('../api/lead.js');

const ENV = { RESEND_API_KEY: 're_test', LEAD_TO_EMAIL: 'owner@example.com, office@example.com', LEAD_FROM_EMAIL: 'Website <leads@santafewindowsanddoors.com>' };

function mockRes() {
  const res = { statusCode: 200, headers: {}, body: undefined, redirectedTo: undefined };
  res.status = (c) => { res.statusCode = c; return res; };
  res.json = (b) => { res.body = b; return res; };
  res.send = (b) => { res.body = b; return res; };
  res.setHeader = (k, v) => { res.headers[k] = v; };
  res.redirect = (c, url) => { res.statusCode = c; res.redirectedTo = url; return res; };
  return res;
}

const jsonReq = (body) => ({ method: 'POST', headers: { accept: 'application/json', 'content-type': 'application/json' }, body, query: {} });
const validLead = { first_name: 'Ana', last_name: 'Martinez', phone: '505-555-0100', email: 'ana@example.com', zip: '87505', project_type: 'Windows', openings: '5–9', timeframe: '1–3 months', historic_district: 'Yes', message: 'Deep adobe openings <b>&</b>' };

let calls;
function mockFetch(reply = { ok: true, status: 200, body: { id: 'email_123' } }) {
  calls = [];
  global.fetch = async (url, opts) => {
    calls.push({ url, opts, body: JSON.parse(opts.body) });
    if (reply instanceof Error) throw reply;
    return { ok: reply.ok, status: reply.status, json: async () => reply.body, text: async () => JSON.stringify(reply.body) };
  };
}

test.beforeEach(() => { Object.assign(process.env, ENV); mockFetch(); });
test.afterEach(() => { for (const k of Object.keys(ENV)) delete process.env[k]; });
const quiet = () => { const e = console.error; console.error = () => {}; return () => { console.error = e; }; };

test('success: sends one email via Resend with all fields and returns JSON ok', async () => {
  const res = mockRes();
  await handler(jsonReq(validLead), res);
  assert.strictEqual(res.statusCode, 200);
  assert.deepStrictEqual(res.body, { ok: true });
  assert.strictEqual(calls.length, 1);
  const { url, opts, body } = calls[0];
  assert.strictEqual(url, 'https://api.resend.com/emails');
  assert.strictEqual(opts.headers.Authorization, 'Bearer re_test');
  assert.deepStrictEqual(body.to, ['owner@example.com', 'office@example.com']);
  assert.strictEqual(body.reply_to, 'ana@example.com');
  assert.match(body.subject, /Ana Martinez \(Windows\)/);
  for (const v of ['87505', '5–9', '1–3 months', 'In a historic district?']) assert.ok(body.text.includes(v), v);
  assert.ok(body.html.includes('&lt;b&gt;&amp;&lt;/b&gt;'), 'message is HTML-escaped');
});

test('honeypot: filled "company" field pretends success and sends nothing', async () => {
  const res = mockRes();
  await handler(jsonReq({ ...validLead, company: 'Spam LLC' }), res);
  assert.deepStrictEqual(res.body, { ok: true });
  assert.strictEqual(calls.length, 0);
});

test('missing name or phone: 400, nothing sent', async () => {
  for (const missing of ['first_name', 'phone']) {
    const res = mockRes();
    await handler(jsonReq({ ...validLead, [missing]: '  ' }), res);
    assert.strictEqual(res.statusCode, 400, missing);
    assert.strictEqual(res.body.ok, false);
  }
  assert.strictEqual(calls.length, 0);
});

test('missing env vars: 500, nothing sent', async () => {
  const restore = quiet();
  for (const k of Object.keys(ENV)) {
    Object.assign(process.env, ENV);
    delete process.env[k];
    const res = mockRes();
    await handler(jsonReq(validLead), res);
    assert.strictEqual(res.statusCode, 500, k);
    assert.match(res.body.error, /not configured/);
  }
  restore();
  assert.strictEqual(calls.length, 0);
});

test('Resend error or network failure: 502', async () => {
  const restore = quiet();
  mockFetch({ ok: false, status: 403, body: { message: 'domain not verified' } });
  let res = mockRes();
  await handler(jsonReq(validLead), res);
  assert.strictEqual(res.statusCode, 502);
  assert.strictEqual(res.body.ok, false);

  mockFetch(new Error('ECONNRESET'));
  res = mockRes();
  await handler(jsonReq(validLead), res);
  assert.strictEqual(res.statusCode, 502);
  restore();
});

test('plain urlencoded form post (no JS) gets a 303 redirect to /thank-you/', async () => {
  const res = mockRes();
  const body = new URLSearchParams(validLead).toString();
  await handler({ method: 'POST', headers: { accept: 'text/html', 'content-type': 'application/x-www-form-urlencoded' }, body, query: {} }, res);
  assert.strictEqual(res.statusCode, 303);
  assert.strictEqual(res.redirectedTo, '/thank-you/');
  assert.strictEqual(calls.length, 1);
  assert.strictEqual(calls[0].body.reply_to, 'ana@example.com');
});

test('non-POST, non-check requests get 405', async () => {
  const res = mockRes();
  await handler({ method: 'GET', headers: {}, query: {} }, res);
  assert.strictEqual(res.statusCode, 405);
  assert.strictEqual(res.headers.Allow, 'POST');
});

test('?check reports which env vars are set (never values) and the sender domain', async () => {
  let res = mockRes();
  await handler({ method: 'GET', headers: {}, query: { check: '' } }, res);
  assert.strictEqual(res.statusCode, 200);
  assert.strictEqual(res.body.RESEND_API_KEY, true);
  assert.strictEqual(res.body.LEAD_TO_EMAIL, true);
  assert.strictEqual(res.body.LEAD_FROM_EMAIL, true);
  assert.strictEqual(res.body.senderDomain, 'santafewindowsanddoors.com');
  assert.ok(!JSON.stringify(res.body).includes('re_test'), 'API key value is never returned');
  assert.ok(!JSON.stringify(res.body).includes('owner@example.com'), 'recipient is never returned');
  assert.strictEqual(res.body.testEmail, undefined);
  assert.strictEqual(calls.length, 0);

  delete process.env.RESEND_API_KEY;
  res = mockRes();
  await handler({ method: 'GET', headers: {}, query: { check: '' } }, res);
  assert.strictEqual(res.body.RESEND_API_KEY, false);
});

test('?check&send only sends to an address in LEAD_TO_EMAIL', async () => {
  let res = mockRes();
  await handler({ method: 'GET', headers: {}, query: { check: '', send: 'stranger@example.com' } }, res);
  assert.strictEqual(res.body.testEmail.sent, false);
  assert.strictEqual(calls.length, 0);

  res = mockRes();
  await handler({ method: 'GET', headers: {}, query: { check: '', send: ' Office@Example.com ' } }, res);
  assert.strictEqual(res.body.testEmail.sent, true);
  assert.strictEqual(res.body.testEmail.resendStatus, 200);
  assert.strictEqual(calls.length, 1);
  assert.deepStrictEqual(calls[0].body.to, ['office@example.com']);
});
