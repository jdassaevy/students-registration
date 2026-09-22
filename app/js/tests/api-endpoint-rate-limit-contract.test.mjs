import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

function source(relative) {
  return fs.readFileSync(new URL(`../../../${relative}`, import.meta.url), 'utf8');
}

const endpoints = [
  ['payment-receipt', 'receipts'],
  ['retry-automation-message', 'automation_messages'],
  ['send-whatsapp', 'students'],
  ['payment-lifecycle', 'receipts'],
];

for (const [endpoint, firstBusinessTable] of endpoints) {
  test(`${endpoint} authenticates before limiter and limits before parsing/business work`, () => {
    const code = source(`supabase/functions/${endpoint}/index.ts`);
    const options = code.indexOf('req.method === "OPTIONS"');
    const auth = code.indexOf('auth.getUser()');
    const limiter = code.indexOf(`checkRateLimit(admin, user.id, "${endpoint}")`);
    const parser = code.indexOf('await readJsonObject(req)');
    const business = code.indexOf(`.from("${firstBusinessTable}")`);

    assert.match(code, /import \{ checkRateLimit \} from ["']\.\.\/_shared\/rate-limit\.ts["']/);
    assert.ok(options >= 0 && options < limiter);
    assert.ok(auth >= 0 && auth < limiter);
    assert.ok(limiter >= 0 && limiter < parser);
    assert.ok(business >= 0 && limiter < business);
    assert.match(code, /rateLimit\.kind === ["']limited["']/);
    assert.match(code, /return json\(req, rateLimit\.body, rateLimit\.status, rateLimit\.headers\)/);
    assert.match(code, /function json\(req: Request, body: unknown, status = 200, extraHeaders: Record<string, string> = \{\}\)/);
    assert.match(code, /\.\.\.corsHeadersFor\(req\), "Content-Type": "application\/json", \.\.\.extraHeaders/);
    assert.match(code, /const respond = \(body: unknown, status = 200\) => json\(req, body, status, rateHeaders\)/);
  });
}

test('Phase 2B leaves webhook and reminder processor outside generic limiter', () => {
  for (const relative of [
    'supabase/functions/whatsapp-webhook/index.ts',
    'supabase/functions/process-reminders/index.ts',
  ]) {
    assert.doesNotMatch(source(relative), /_shared\/rate-limit\.ts|checkRateLimit\(/);
  }
});
