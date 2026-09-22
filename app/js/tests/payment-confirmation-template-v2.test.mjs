import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const read = path => fs.readFileSync(new URL(path, import.meta.url), 'utf8');
const whatsapp = read('../../../supabase/functions/_shared/whatsapp.ts');
const lifecycle = read('../../../supabase/functions/payment-lifecycle/index.ts');
const retry = read('../../../supabase/functions/retry-automation-message/index.ts');

test('payment confirmation v2 is staged under a new Meta template name', () => {
  assert.match(whatsapp, /paymentConfirmation:\s*["']dassaevy_payment_confirmation["']/);
  assert.match(whatsapp, /paymentConfirmationV2:\s*["']dassaevy_payment_confirmation_v2["']/);
});

test('v2 parameter order is student, payment label, amount, academy and support phone', () => {
  assert.match(
    whatsapp,
    /bodyParameters:\s*useV2[\s\S]*\[studentName, paymentLabel, amount, academyName, cleanSupportPhone\][\s\S]*\[studentName, paymentLabel, amount, academyName\]/,
  );
});

test('v2 falls back to the approved v1 template when phone is missing or v2 is not selected', () => {
  assert.match(whatsapp, /preferredTemplateName === TEMPLATE_NAMES\.paymentConfirmationV2/);
  assert.match(whatsapp, /Boolean\(cleanSupportPhone\)/);
  assert.match(whatsapp, /:\s*TEMPLATE_NAMES\.paymentConfirmation,/);
});

test('normal payment confirmation reads academy profile name and support phone through the shared helper', () => {
  assert.match(lifecycle, /select\(["']name,display_name,responsible_name,support_phone["']\)/);
  assert.match(lifecycle, /const academyMessageName = academy\.display_name \|\| academy\.name/);
  assert.match(lifecycle, /buildPaymentConfirmationTemplate\(\{[\s\S]*studentName,[\s\S]*paymentLabel: label,[\s\S]*amount: money\(notificationAmount\),[\s\S]*academyName: academyMessageName,[\s\S]*supportPhone: academy\.support_phone/);
  assert.match(lifecycle, /Deno\.env\.get\(["']META_PAYMENT_CONFIRMATION_V2_ENABLED["']\) === ["']true["']/);
});

test('payment confirmation retry uses the same shared parameter builder as normal delivery', () => {
  assert.match(retry, /source\.automation_type === ["']payment_confirmation["']/);
  assert.match(retry, /buildPaymentConfirmationTemplate\(\{[\s\S]*studentName: studentName \|\| ["']Aluno["'][\s\S]*paymentLabel: label,[\s\S]*amount: money\(receipt\.amount\),[\s\S]*academyName,[\s\S]*supportPhone: academy\?\.support_phone/);
  assert.match(retry, /templateName: confirmationTemplate\.templateName/);
  assert.match(retry, /bodyParameters: confirmationTemplate\.bodyParameters/);
});

test('payment voided retry keeps its independent seven-variable contract', () => {
  assert.match(retry, /templateName: TEMPLATE_NAMES\.paymentVoided/);
  assert.match(retry, /bodyParameters:\s*\[[\s\S]*studentName \|\| ["']Aluno["'],[\s\S]*academyName,[\s\S]*label,[\s\S]*money\(receipt\.amount\),[\s\S]*receipt\.receipt_number,[\s\S]*responsible_name[\s\S]*support_phone/);
});
