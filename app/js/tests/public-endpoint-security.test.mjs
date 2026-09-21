import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { stripTypeScriptTypes } from 'node:module';

function source(relative) {
  return fs.readFileSync(new URL(`../../../${relative}`, import.meta.url), 'utf8');
}

const requestSecuritySource = source('supabase/functions/_shared/request-security.ts');
const previousEmitWarning = process.emitWarning;
process.emitWarning = () => {};
const requestSecurityJs = stripTypeScriptTypes(requestSecuritySource, { mode: 'strip' });
process.emitWarning = previousEmitWarning;
const requestSecurity = await import(
  `data:text/javascript;base64,${Buffer.from(requestSecurityJs).toString('base64')}`,
);
const { constantTimeEqual, matchesSecret } = requestSecurity;

test('secret comparisons reject missing, mismatched, and oversized values', () => {
  assert.equal(constantTimeEqual('same-secret', 'same-secret'), true);
  assert.equal(constantTimeEqual('same-secret', 'same-secrex'), false);
  assert.equal(constantTimeEqual('short', 'longer'), false);

  assert.equal(matchesSecret('cron-secret', 'cron-secret'), true);
  assert.equal(matchesSecret('cron-secret', 'wrong'), false);
  assert.equal(matchesSecret('cron-secret', null), false);
  assert.equal(matchesSecret('x'.repeat(513), 'x'.repeat(513)), false);
});

test('WhatsApp webhook bounds the raw body before signature verification', () => {
  const code = source('supabase/functions/whatsapp-webhook/index.ts');
  const boundedRead = code.indexOf('await readBoundedText(req, MAX_WEBHOOK_BYTES)');
  const signature = code.indexOf('await verifyMetaSignature(rawBody');

  assert.match(code, /readBoundedText/);
  assert.match(code, /MAX_WEBHOOK_BYTES/);
  assert.ok(boundedRead >= 0 && boundedRead < signature);
  assert.match(code, /isApiInputError/);
  assert.match(code, /validationErrorPayload/);
});

test('WhatsApp webhook has a conservative body cap and bounded provider fields', () => {
  const code = source('supabase/functions/_shared/whatsapp-webhook.ts');

  assert.match(code, /MAX_WEBHOOK_BYTES\s*=\s*256\s*\*\s*1024/);
  assert.match(code, /boundedString\(item\?\.id,\s*512\)/);
  assert.match(code, /boundedString\(firstError\?\.code,\s*64\)/);
  assert.match(code, /1000/);
  assert.match(code, /\^sha256=\[0-9a-f\]\{64\}\$/i);
});

test('WhatsApp verification token uses shared bounded constant-time secret comparison', () => {
  const code = source('supabase/functions/whatsapp-webhook/index.ts');
  assert.match(code, /matchesSecret\(verifyToken, token\)/);
  assert.doesNotMatch(code, /token\s*===\s*verifyToken|verifyToken\s*===\s*token/);
});

test('reminder processor authenticates cron secret before privileged database work', () => {
  const code = source('supabase/functions/process-reminders/index.ts');
  const method = code.indexOf('req.method !== "POST"');
  const secret = code.indexOf('matchesSecret(expectedCronSecret, receivedCronSecret)');
  const admin = code.indexOf('createClient(supabaseUrl, serviceRoleKey)');

  assert.ok(method >= 0 && method < secret);
  assert.ok(secret >= 0 && secret < admin);
  assert.doesNotMatch(code, /receivedCronSecret\s*!==\s*expectedCronSecret/);
});
