import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const root = new URL('../../../supabase/functions/', import.meta.url);

const endpoints = [
  'payment-receipt',
  'payment-lifecycle',
  'send-whatsapp',
  'retry-automation-message',
  'whatsapp-webhook',
  'process-reminders',
];

const read = relative => fs.readFileSync(new URL(relative, root), 'utf8');

test('shared observability helper emits only allowlisted technical fields', () => {
  const source = read('_shared/observability.ts');

  for (const allowed of [
    'status?:',
    'code?:',
    'outcome?:',
    'duration_ms?:',
    'count?:',
    'method?:',
  ]) {
    assert.match(source, new RegExp(allowed.replace(/[?]/g, '\\?')));
  }

  for (const forbidden of [
    'phone',
    'student',
    'user_id',
    'academy_id',
    'provider_message_id',
    'access_token',
    'authorization',
    'payload',
    'body_parameters',
  ]) {
    assert.doesNotMatch(
      source,
      new RegExp(`\\b${forbidden}\\b`, 'i'),
      `observability helper must not expose ${forbidden}`,
    );
  }

  assert.match(source, /REQUEST_ID_PATTERN/);
  assert.match(source, /crypto\.randomUUID\(\)/);
  assert.match(source, /"X-Request-ID"/);
});

test('all Phase 3A Edge Functions return request tracing and avoid raw console logging', () => {
  for (const endpoint of endpoints) {
    const source = read(`${endpoint}/index.ts`);
    assert.match(source, /\.\.\.traceHeaders\(req\)/, `${endpoint} must return X-Request-ID`);
    assert.doesNotMatch(
      source,
      /console\.(?:log|info|warn|error)\s*\(/,
      `${endpoint} must use the safe structured logger instead of raw console output`,
    );
  }
});

test('authenticated CORS responses expose X-Request-ID to browser clients', () => {
  const source = read('_shared/cors.ts');
  assert.match(source, /"X-Request-ID"/);
  assert.match(source, /Access-Control-Expose-Headers/);
});

test('webhook observability never logs provider message identifiers', () => {
  const source = read('whatsapp-webhook/index.ts');
  const safeLogCalls = [...source.matchAll(/logSafeEvent\([\s\S]*?\);/g)].map(match => match[0]).join('\n');

  assert.doesNotMatch(safeLogCalls, /providerMessageId/);
  assert.doesNotMatch(safeLogCalls, /event\.id/);
  assert.doesNotMatch(safeLogCalls, /rawBody/);
  assert.doesNotMatch(safeLogCalls, /signatureHeader/);
});

test('reminder observability is aggregate-only', () => {
  const source = read('process-reminders/index.ts');
  const safeLogCalls = [...source.matchAll(/logSafeEvent\([\s\S]*?\);/g)].map(match => match[0]).join('\n');

  assert.match(safeLogCalls, /summary\.failed/);
  assert.match(safeLogCalls, /summary\.sent/);
  assert.match(safeLogCalls, /summary\.tenant_mismatch/);
  assert.doesNotMatch(safeLogCalls, /candidate\./);
  assert.doesNotMatch(safeLogCalls, /student\./);
});
