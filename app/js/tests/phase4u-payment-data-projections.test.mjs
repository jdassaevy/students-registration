import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const read = path => fs.readFileSync(new URL(path, import.meta.url), 'utf8');
const lifecycle = read('../../../supabase/functions/payment-lifecycle/index.ts');
const receipt = read('../../../supabase/functions/payment-receipt/index.ts');
const projections = read('../../../supabase/functions/_shared/payment-projections.ts');

test('shared payment projections define bounded receipt and event payloads', () => {
  assert.match(
    projections,
    /export const RECEIPT_RUNTIME_SELECT\s*=\s*["']id,user_id,academy_id,student_id,person,kind,installment,amount,paid_at,receipt_number,status,storage_path["']/
  );
  assert.match(
    projections,
    /export const PAYMENT_EVENT_RUNTIME_SELECT\s*=\s*["']academy_id,paid_at["']/
  );
  assert.match(
    projections,
    /export const RECEIPT_WITH_CONTEXT_SELECT\s*=\s*[\s\S]*student_row:students!receipts_student_id_fkey\(id,person1,person2,academy_id\)[\s\S]*class_row:classes!receipts_class_id_fkey\(name,academy_id\)/
  );
});

test('payment lifecycle uses bounded projections for receipt and payment-event reads', () => {
  assert.match(lifecycle, /RECEIPT_RUNTIME_SELECT/);
  assert.match(lifecycle, /PAYMENT_EVENT_RUNTIME_SELECT/);
  assert.doesNotMatch(
    lifecycle,
    /from\(["']receipts["']\)[\s\S]{0,120}\.select\(["']\*["']\)/
  );
  assert.doesNotMatch(
    lifecycle,
    /from\(["']payment_events["']\)[\s\S]{0,120}\.select\(["']\*["']\)/
  );
  assert.doesNotMatch(
    lifecycle,
    /from\(["']payment_events["']\)[\s\S]{0,220}\.insert\([\s\S]{0,220}\)\.select\(\)\.single\(\)/
  );
  assert.doesNotMatch(
    lifecycle,
    /from\(["']receipts["']\)[\s\S]{0,320}\.insert\([\s\S]{0,320}\)\.select\(\)\.single\(\)/
  );
});

test('payment lifecycle trims unused student fields without weakening tenant context', () => {
  assert.match(
    lifecycle,
    /select\(["']id,academy_id,class_id,person1,person2,entry_payments,payments,fees,person1_phone,person2_phone,person1_whatsapp_consent,person2_whatsapp_consent,class_row:classes!students_class_id_fkey\(name,academy_id\)["']\)/
  );
  assert.doesNotMatch(
    lifecycle,
    /select\(["'][^"']*user_id[^"']*class_row:classes!students_class_id_fkey/
  );
  assert.match(lifecycle, /requireAcademyContext\(admin, user\.id, student\.academy_id\)/);
});

test('payment receipt keeps independent auth and tenant checks with bounded embedded receipt data', () => {
  assert.match(receipt, /RECEIPT_WITH_CONTEXT_SELECT/);
  assert.match(receipt, /RECEIPT_RUNTIME_SELECT/);
  assert.doesNotMatch(
    receipt,
    /from\(["']receipts["']\)[\s\S]{0,160}\.select\(["']\*/
  );
  assert.match(receipt, /authClient\.auth\.getUser\(\)/);
  assert.match(receipt, /requireAcademyContext\(admin, user\.id, receipt\.academy_id\)/);
  assert.match(receipt, /student\.academy_id !== receipt\.academy_id/);
  assert.match(receipt, /classRow && classRow\.academy_id !== receipt\.academy_id/);
});

test('receipt update responses use the shared bounded projection', () => {
  assert.match(
    receipt,
    /\.update\(\{ storage_path: storagePath \}\)[\s\S]{0,220}\.select\(RECEIPT_RUNTIME_SELECT\)/
  );
  assert.match(
    lifecycle,
    /\.update\(\{ storage_path: storagePath \}\)[\s\S]{0,220}\.select\(RECEIPT_RUNTIME_SELECT\)/
  );
  assert.match(
    lifecycle,
    /\.update\(\{ status: ["']voided["'] \}\)[\s\S]{0,240}\.select\(RECEIPT_RUNTIME_SELECT\)/
  );
});
