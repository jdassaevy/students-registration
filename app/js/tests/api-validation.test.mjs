import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { stripTypeScriptTypes } from 'node:module';

const tsSource = fs.readFileSync(
  new URL('../../../supabase/functions/_shared/api-validation.ts', import.meta.url),
  'utf8',
);
const previousEmitWarning = process.emitWarning;
process.emitWarning = () => {};
const jsSource = stripTypeScriptTypes(tsSource, { mode: 'strip' });
process.emitWarning = previousEmitWarning;
const validationModule = await import(`data:text/javascript;base64,${Buffer.from(jsSource).toString('base64')}`);
const {
  MAX_JSON_BYTES,
  ApiInputError,
  readBoundedText,
  readJsonObject,
  requireUuid,
  optionalUuid,
  requireEnum,
  requireInteger,
  requireTrimmedString,
  optionalTrimmedString,
  optionalBoolean,
  optionalPrimitiveArray,
  validationErrorPayload,
} = validationModule;

const UUID = '11111111-1111-4111-8111-111111111111';

function expectInputError(fn, code, field) {
  assert.throws(fn, error => {
    assert.ok(error instanceof ApiInputError);
    assert.equal(error.code, code);
    assert.equal(error.field ?? null, field ?? null);
    return true;
  });
}

test('uuid validator trims valid UUID and rejects malformed UUID', () => {
  assert.equal(requireUuid(`  ${UUID}  `, 'student_id'), UUID);
  expectInputError(() => requireUuid('not-a-uuid', 'student_id'), 'INVALID_INPUT', 'student_id');
  assert.equal(optionalUuid('', 'receipt_id'), null);
});

test('enum validator trims exact known values and rejects aliases', () => {
  assert.equal(requireEnum(' person1 ', 'person', ['person1', 'person2']), 'person1');
  expectInputError(() => requireEnum('pessoa1', 'person', ['person1', 'person2']), 'INVALID_INPUT', 'person');
});

test('integer validator accepts numeric strings but rejects decimals and range overflow', () => {
  assert.equal(requireInteger('2', 'installment', { min: 1, max: 3 }), 2);
  expectInputError(() => requireInteger('2.5', 'installment', { min: 1, max: 3 }), 'INVALID_INPUT', 'installment');
  expectInputError(() => requireInteger(4, 'installment', { min: 1, max: 3 }), 'INVALID_INPUT', 'installment');
});

test('bounded strings trim and reject overflow instead of truncating', () => {
  assert.equal(requireTrimmedString('  request-1  ', 'request_id', { maxLength: 160 }), 'request-1');
  assert.equal(optionalTrimmedString('', 'idempotency_key', { maxLength: 240 }), null);
  expectInputError(() => requireTrimmedString('x'.repeat(161), 'request_id', { maxLength: 160 }), 'INVALID_INPUT', 'request_id');
});

test('optional boolean accepts only real booleans', () => {
  assert.equal(optionalBoolean(undefined, 'acknowledge_configuration_fix'), false);
  assert.equal(optionalBoolean(true, 'acknowledge_configuration_fix'), true);
  assert.equal(optionalBoolean(null, 'acknowledge_configuration_fix', true), true);
  expectInputError(
    () => optionalBoolean('true', 'acknowledge_configuration_fix'),
    'INVALID_INPUT',
    'acknowledge_configuration_fix',
  );
});

test('primitive arrays enforce item count and primitive types', () => {
  assert.deepEqual(optionalPrimitiveArray(['a', 2], 'body_parameters', { maxItems: 12 }), ['a', 2]);
  expectInputError(() => optionalPrimitiveArray(Array(13).fill('x'), 'body_parameters', { maxItems: 12 }), 'INVALID_INPUT', 'body_parameters');
  expectInputError(() => optionalPrimitiveArray([{ bad: true }], 'body_parameters', { maxItems: 12 }), 'INVALID_INPUT', 'body_parameters');
});

test('readBoundedText accepts the exact limit and rejects a declared overflow', async () => {
  const body = 'x'.repeat(32);
  const accepted = new Request('https://example.test', { method: 'POST', body });
  assert.equal(await readBoundedText(accepted, 32), body);

  const oversized = new Request('https://example.test', {
    method: 'POST',
    headers: { 'content-length': '33' },
    body,
  });
  await assert.rejects(
    () => readBoundedText(oversized, 32),
    error => error instanceof ApiInputError && error.code === 'PAYLOAD_TOO_LARGE' && error.status === 413,
  );
});

test('readJsonObject classifies malformed JSON', async () => {
  await assert.rejects(
    () => readJsonObject(new Request('https://example.test', { method: 'POST', body: '{bad' })),
    error => error instanceof ApiInputError && error.code === 'INVALID_JSON' && error.status === 400,
  );
});

test('readJsonObject accepts exactly the configured boundary and rejects larger payloads', async () => {
  const raw = JSON.stringify({ value: 'x'.repeat(128) });
  const bytes = new TextEncoder().encode(raw).byteLength;
  assert.deepEqual(
    await readJsonObject(new Request('https://example.test', { method: 'POST', body: raw }), bytes),
    JSON.parse(raw),
  );
  await assert.rejects(
    () => readJsonObject(new Request('https://example.test', { method: 'POST', body: raw }), bytes - 1),
    error => error instanceof ApiInputError && error.code === 'PAYLOAD_TOO_LARGE' && error.status === 413,
  );
  assert.equal(MAX_JSON_BYTES, 64 * 1024);
});


test('readJsonObject rejects no-content-length stream at max + 1 without draining it', async () => {
  let pulls = 0;
  let cancelled = false;
  const chunk = new TextEncoder().encode('x'.repeat(1024));
  const stream = new ReadableStream({
    pull(controller) {
      pulls += 1;
      controller.enqueue(chunk);
      if (pulls >= 100) controller.close();
    },
    cancel() { cancelled = true; },
  });
  const req = new Request('https://example.test', { method: 'POST', body: stream, duplex: 'half' });
  await assert.rejects(
    () => readJsonObject(req, 2048),
    error => error instanceof ApiInputError && error.code === 'PAYLOAD_TOO_LARGE' && error.status === 413,
  );
  assert.equal(cancelled, true);
  assert.ok(pulls < 100);
});

test('readJsonObject still accepts an in-range streamed JSON object', async () => {
  const raw = JSON.stringify({ ok: true });
  const req = new Request('https://example.test', { method: 'POST', body: raw });
  assert.deepEqual(await readJsonObject(req), { ok: true });
});

test('validationErrorPayload exposes only stable public validation data', () => {
  const payload = validationErrorPayload(new ApiInputError('INVALID_INPUT', 400, 'person'));
  assert.deepEqual(payload, { error: 'Invalid request', code: 'INVALID_INPUT', field: 'person' });
});
