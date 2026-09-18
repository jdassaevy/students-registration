import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { stripTypeScriptTypes } from 'node:module';

const tsSource = fs.readFileSync(
  new URL('../../../supabase/functions/_shared/rate-limit.ts', import.meta.url),
  'utf8',
);
const previousEmitWarning = process.emitWarning;
process.emitWarning = () => {};
const jsSource = stripTypeScriptTypes(tsSource, { mode: 'strip' });
process.emitWarning = previousEmitWarning;
const mod = await import(`data:text/javascript;base64,${Buffer.from(jsSource).toString('base64')}`);
const { RATE_LIMITS, checkRateLimit } = mod;

test('rate limits are exactly the approved conservative values', () => {
  assert.deepEqual(RATE_LIMITS, {
    'payment-lifecycle': 60,
    'payment-receipt': 30,
    'send-whatsapp': 15,
    'retry-automation-message': 10,
  });
});

test('allowed result exposes stable rate metadata', async () => {
  const reset_at = '2026-09-14T20:01:00Z';
  const admin = { rpc: async () => ({ data: [{ allowed: true, limit_value: 15, remaining: 14, retry_after_seconds: 40, reset_at }], error: null }) };
  const result = await checkRateLimit(admin, 'user-1', 'send-whatsapp');
  assert.equal(result.kind, 'allowed');
  assert.equal(result.headers['X-RateLimit-Limit'], '15');
  assert.equal(result.headers['X-RateLimit-Remaining'], '14');
  assert.equal(result.headers['X-RateLimit-Reset'], String(Date.parse(reset_at) / 1000));
});

test('limited result returns exact 429 body and retry metadata', async () => {
  const reset_at = '2026-09-14T20:01:00Z';
  const admin = { rpc: async () => ({ data: [{ allowed: false, limit_value: 10, remaining: 0, retry_after_seconds: 22, reset_at }], error: null }) };
  const result = await checkRateLimit(admin, 'user-1', 'retry-automation-message');
  assert.equal(result.kind, 'limited');
  assert.equal(result.status, 429);
  assert.deepEqual(result.body, { error: 'Too many requests', code: 'RATE_LIMITED' });
  assert.equal(result.headers['Retry-After'], '22');
  assert.equal(result.headers['X-RateLimit-Remaining'], '0');
});

const failOpenCases = [
  ['rpc error', async () => ({ data: null, error: new Error('db unavailable') })],
  ['thrown rpc', async () => { throw new Error('db unavailable'); }],
  ['empty data', async () => ({ data: [], error: null })],
  ['multiple rows', async () => ({ data: [{}, {}], error: null })],
  ['non-boolean allowed', async () => ({ data: [{ allowed: 'yes', limit_value: 15, remaining: 1, retry_after_seconds: 1, reset_at: '2026-09-14T20:01:00Z' }], error: null })],
  ['negative remaining', async () => ({ data: [{ allowed: true, limit_value: 15, remaining: -1, retry_after_seconds: 1, reset_at: '2026-09-14T20:01:00Z' }], error: null })],
  ['invalid retry', async () => ({ data: [{ allowed: true, limit_value: 15, remaining: 1, retry_after_seconds: 0, reset_at: '2026-09-14T20:01:00Z' }], error: null })],
  ['invalid reset', async () => ({ data: [{ allowed: true, limit_value: 15, remaining: 1, retry_after_seconds: 1, reset_at: 'not-a-date' }], error: null })],
];

for (const [name, rpc] of failOpenCases) {
  test(`rate limiter fails open on ${name}`, async () => {
    const warn = console.warn;
    console.warn = () => {};
    try {
      assert.deepEqual(await checkRateLimit({ rpc }, 'user-1', 'send-whatsapp'), { kind: 'fail-open', headers: {} });
    } finally {
      console.warn = warn;
    }
  });
}

test('helper sends only the server-owned endpoint limit to RPC', async () => {
  let args;
  const admin = { rpc: async (name, input) => {
    args = { name, input };
    return { data: [{ allowed: true, limit_value: 30, remaining: 29, retry_after_seconds: 40, reset_at: '2026-09-14T20:01:00Z' }], error: null };
  } };
  await checkRateLimit(admin, 'user-9', 'payment-receipt');
  assert.deepEqual(args, {
    name: 'check_rate_limit',
    input: { p_user_id: 'user-9', p_endpoint: 'payment-receipt', p_limit: 30 },
  });
});
