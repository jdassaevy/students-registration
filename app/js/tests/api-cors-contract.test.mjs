import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { stripTypeScriptTypes } from 'node:module';

function source(relative) {
  return fs.readFileSync(new URL(`../../../${relative}`, import.meta.url), 'utf8');
}

const tsSource = source('supabase/functions/_shared/cors.ts');
const previousEmitWarning = process.emitWarning;
process.emitWarning = () => {};
const jsSource = stripTypeScriptTypes(tsSource, { mode: 'strip' });
process.emitWarning = previousEmitWarning;
const corsModule = await import(`data:text/javascript;base64,${Buffer.from(jsSource).toString('base64')}`);
const { ALLOWED_BROWSER_ORIGINS, corsHeadersFor, isAllowedCorsRequest } = corsModule;

const approvedBrowserOrigins = [
  'https://alunos.dassaevylabs.com.br',
  'https://students-registration-multi-academy.vercel.app',
  'https://students-registration-git-e6e85e-jdassaevy12345-6044s-projects.vercel.app',
];

test('CORS allowlist contains only approved app origins plus local Live Server origins', () => {
  assert.deepEqual(
    [...ALLOWED_BROWSER_ORIGINS],
    [
      ...approvedBrowserOrigins,
      'http://localhost:5500',
      'http://127.0.0.1:5500',
    ],
  );
  assert.equal(tsSource.includes('*.vercel.app'), false);
  assert.equal(tsSource.includes('endsWith(".vercel.app")'), false);
  assert.equal(tsSource.includes('"*"'), false);
});

test('allowed browser origin is echoed exactly with required Supabase headers', () => {
  for (const origin of approvedBrowserOrigins) {
    const req = new Request('https://functions.example.test', { headers: { origin } });
    assert.equal(isAllowedCorsRequest(req), true);
    const headers = corsHeadersFor(req);
    assert.equal(headers['Access-Control-Allow-Origin'], origin);
    assert.equal(headers.Vary, 'Origin');
    assert.match(headers['Access-Control-Allow-Methods'], /POST/);
    assert.match(headers['Access-Control-Allow-Methods'], /OPTIONS/);
    for (const header of [
      'authorization',
      'x-client-info',
      'apikey',
      'content-type',
      'x-retry-count',
      'traceparent',
      'tracestate',
      'baggage',
    ]) {
      assert.match(headers['Access-Control-Allow-Headers'], new RegExp(`(^|, )${header}(,|$)`));
    }
  }
});

test('unknown browser origins are rejected and never receive an allow-origin header', () => {
  const req = new Request('https://functions.example.test', {
    headers: { origin: 'https://evil.example' },
  });
  assert.equal(isAllowedCorsRequest(req), false);
  assert.equal(corsHeadersFor(req)['Access-Control-Allow-Origin'], undefined);
});

test('originless server-to-server requests remain allowed', () => {
  const req = new Request('https://functions.example.test');
  assert.equal(isAllowedCorsRequest(req), true);
  assert.equal(corsHeadersFor(req)['Access-Control-Allow-Origin'], undefined);
});

for (const endpoint of [
  'payment-receipt',
  'retry-automation-message',
  'send-whatsapp',
  'payment-lifecycle',
]) {
  test(`${endpoint} enforces shared origin allowlist before preflight/authenticated work`, () => {
    const code = source(`supabase/functions/${endpoint}/index.ts`);
    const guard = code.indexOf('if (!isAllowedCorsRequest(req))');
    const options = code.indexOf('req.method === "OPTIONS"');
    const auth = code.indexOf('auth.getUser()');

    assert.match(code, /_shared\/cors\.ts/);
    assert.ok(guard >= 0 && guard < options);
    assert.ok(auth < 0 || guard < auth);
    assert.doesNotMatch(code, /Access-Control-Allow-Origin["']?\s*:\s*["']\*["']/);
    assert.match(code, /corsHeadersFor\(req\)/);
  });
}
