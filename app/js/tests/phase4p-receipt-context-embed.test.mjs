import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const source = fs.readFileSync(
  new URL('../../../supabase/functions/payment-receipt/index.ts', import.meta.url),
  'utf8'
);

const projections = fs.readFileSync(
  new URL('../../../supabase/functions/_shared/payment-projections.ts', import.meta.url),
  'utf8'
);

test('payment-receipt embeds student and class context in the receipt read', () => {
  assert.match(source, /\.select\(RECEIPT_WITH_CONTEXT_SELECT\)/);
  assert.match(
    projections,
    /student_row:students!receipts_student_id_fkey\(id,person1,person2,academy_id\)/
  );
  assert.match(
    projections,
    /class_row:classes!receipts_class_id_fkey\(name,academy_id\)/
  );
});

test('payment-receipt does not issue separate student or class reads', () => {
  assert.doesNotMatch(
    source,
    /admin\s*\.from\(["']students["']\)[\s\S]*?\.select\(["']id,person1,person2,academy_id["']\)/
  );
  assert.doesNotMatch(
    source,
    /admin\s*\.from\(["']classes["']\)[\s\S]*?\.select\(["']name,academy_id["']\)/
  );
});

test('embedded student and class context still fail closed before PDF reuse', () => {
  assert.match(source, /const student = receipt\.student_row/);
  assert.match(source, /if \(!student\) return respond\(\{ error: ["']Student not found["'] \}, 404\)/);
  assert.match(source, /student\.academy_id !== receipt\.academy_id/);
  assert.match(source, /const classRow = receipt\.class_row/);
  assert.match(source, /classRow && classRow\.academy_id !== receipt\.academy_id/);

  const studentTenantCheck = source.indexOf('student.academy_id !== receipt.academy_id');
  const classTenantCheck = source.indexOf('classRow && classRow.academy_id !== receipt.academy_id');
  const pdfReuse = source.indexOf('if (receipt.storage_path)');

  assert.ok(studentTenantCheck >= 0, 'student tenant check must exist');
  assert.ok(classTenantCheck >= 0, 'class tenant check must exist');
  assert.ok(pdfReuse > studentTenantCheck, 'student tenant check must happen before PDF reuse');
  assert.ok(pdfReuse > classTenantCheck, 'class tenant check must happen before PDF reuse');
});

test('internal embedded rows are stripped from reused receipt responses', () => {
  assert.match(
    source,
    /const \{ student_row: _studentRow, class_row: _classRow, \.\.\.publicReceipt \} = receipt/
  );
  assert.match(
    source,
    /if \(receipt\.storage_path\) return respond\(\{ receipt: publicReceipt \}\)/
  );
});
