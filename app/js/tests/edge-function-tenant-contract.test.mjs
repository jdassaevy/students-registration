import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

function source(relative) {
  return fs.readFileSync(new URL(`../../../${relative}`, import.meta.url), 'utf8');
}

test('send-whatsapp authorizes academy and validates exact receipt/student linkage', () => {
  const code = source('supabase/functions/send-whatsapp/index.ts');
  assert.match(code, /requireAcademyAccess/);
  assert.match(code, /receiptMatchesStudent/);
  assert.match(code, /academy_id:\s*student\.academy_id/);
});

test('retry uses academy membership instead of user ownership alone', () => {
  const code = source('supabase/functions/retry-automation-message/index.ts');
  assert.match(code, /requireAcademyAccess/);
  assert.match(code, /receiptMatchesStudent/);
  assert.doesNotMatch(code, /student\.user_id\s*!==\s*user\.id/);
});

test('payment lifecycle writes tenant-scoped automation logs', () => {
  const code = source('supabase/functions/payment-lifecycle/index.ts');
  assert.match(code, /requireAcademyAccess/);
  assert.match(code, /academy_id:\s*student\.academy_id/);
});

test('process-reminders keeps cron-secret auth and writes academy-scoped logs', () => {
  const code = source('supabase/functions/process-reminders/index.ts');
  assert.match(code, /AUTOMATION_CRON_SECRET/);
  assert.match(code, /req\.headers\.get\("x-cron-secret"\)/);
  assert.match(code, /receivedCronSecret\s*!==\s*expectedCronSecret/);
  assert.ok(code.indexOf('receivedCronSecret !== expectedCronSecret') < code.indexOf('createClient(supabaseUrl, serviceRoleKey)'), 'cron secret must be checked before service-role client creation');
  assert.match(code, /academy_id/);
});


test('reminder helper propagates academy identity and rejects tenant mismatch', () => {
  const code = source('supabase/functions/_shared/reminders.js');
  assert.match(code, /clazz\?\.academy_id\s*!==\s*student\.academy_id/);
  assert.match(code, /academyId:\s*student\.academy_id/);
});
