import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

function source(relative) {
  return fs.readFileSync(new URL(`../../../${relative}`, import.meta.url), 'utf8');
}

test('payment-receipt validates bounded JSON and receipt UUID before receipt query', () => {
  const code = source('supabase/functions/payment-receipt/index.ts');
  assert.match(code, /readJsonObject/);
  assert.match(code, /requireUuid\(body\?\.receipt_id,\s*["']receipt_id["']\)/);
  assert.match(code, /isApiInputError/);
  assert.ok(code.indexOf('requireUuid') < code.indexOf('.from("receipts")'));
});

test('retry validates message UUID and bounded request id before source lookup', () => {
  const code = source('supabase/functions/retry-automation-message/index.ts');
  assert.match(code, /readJsonObject/);
  assert.match(code, /requireUuid\(body\?\.source_message_id,\s*["']source_message_id["']\)/);
  assert.match(code, /requireTrimmedString\(body\?\.request_id,\s*["']request_id["']/);
  assert.match(code, /optionalBoolean\([\s\S]*body\?\.acknowledge_configuration_fix/);
  assert.match(code, /maxLength:\s*160/);
  assert.match(code, /isApiInputError/);
  assert.ok(code.indexOf('requireUuid') < code.indexOf('.from("automation_messages")'));
  assert.match(code, /select\(["']id,user_id,academy_id,student_id,class_id,receipt_id,person,automation_type,status,error_code["']\)/);
  assert.match(code, /configurationFixAcknowledged:\s*acknowledgeConfigurationFix/);
});

test('send-whatsapp validates all consumed request fields before student lookup', () => {
  const code = source('supabase/functions/send-whatsapp/index.ts');
  assert.match(code, /readJsonObject/);
  assert.match(code, /requireUuid\(body\?\.student_id,\s*["']student_id["']\)/);
  assert.match(code, /requireEnum\(body\?\.person,\s*["']person["']/);
  assert.match(code, /requireEnum\(body\?\.automation_type,\s*["']automation_type["']/);
  assert.match(code, /optionalPrimitiveArray\(body\?\.body_parameters/);
  assert.match(code, /maxItems:\s*12/);
  assert.match(code, /optionalTrimmedString\(body\?\.idempotency_key/);
  assert.match(code, /maxLength:\s*240/);
  assert.match(code, /automationType\s*===\s*["']receipt_document["']/);
  assert.match(code, /requireUuid\(body\?\.receipt_id,\s*["']receipt_id["']\)/);
  assert.match(code, /isApiInputError/);
  assert.ok(code.indexOf('requireUuid(body?.student_id') < code.indexOf('.from("students")'));
});

test('payment-lifecycle validates operation and payment modes explicitly', () => {
  const code = source('supabase/functions/payment-lifecycle/index.ts');
  assert.match(code, /readJsonObject/);
  assert.match(code, /hasOwnProperty\.call\(body,\s*["']operation["']\)/);
  assert.match(code, /requireEnum\(body\.operation/);
  assert.match(code, /requireUuid\(body\.receipt_id/);
  assert.match(code, /requireUuid\(body\.student_id/);
  assert.match(code, /requireEnum\(body\.person/);
  assert.match(code, /requireEnum\(body\.kind/);
  assert.match(code, /requireInteger\(body\.installment/);
  assert.match(code, /isApiInputError/);
});
