import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const source = fs.readFileSync(
    new URL('../../../supabase/functions/payment-receipt/index.ts', import.meta.url),
    'utf8'
);

test('payment-receipt accepts only active monthly receipts', () => {
    assert.match(source, /receipt\.kind\s*!==\s*["']monthly["']/);
    assert.match(source, /receipt\.status\s*!==\s*["']active["']/);
});

test('payment-receipt authorizes through active academy membership context', () => {
    assert.match(source, /requireAcademyContext/);
    assert.match(source, /requireAcademyContext\(admin,\s*user\.id,\s*receipt\.academy_id\)/);
    assert.doesNotMatch(source, /receipt\.user_id\s*!==\s*user\.id/);
});

test('payment-receipt reuses tenant academy identity from membership context', () => {
    assert.match(source, /const academy = academyAccess\.academy/);
    assert.doesNotMatch(source, /from\(["']academies["']\)/);
    assert.doesNotMatch(source, /from\(["']academy_profiles["']\)/);
    assert.match(source, /academyName:\s*academy\.name/);
});

test('payment-receipt fails closed on embedded student and class tenant mismatches before PDF reuse', () => {
    assert.match(
        source,
        /student_row:students!receipts_student_id_fkey\(id,person1,person2,academy_id\)/
    );
    assert.match(
        source,
        /class_row:classes!receipts_class_id_fkey\(name,academy_id\)/
    );
    assert.match(source, /student\.academy_id\s*!==\s*receipt\.academy_id/);
    assert.match(source, /classRow\s*&&\s*classRow\.academy_id\s*!==\s*receipt\.academy_id/);

    const studentTenantCheck = source.indexOf('student.academy_id !== receipt.academy_id');
    const classTenantCheck = source.indexOf('classRow && classRow.academy_id !== receipt.academy_id');
    const pdfReuse = source.indexOf('if (receipt.storage_path)');
    assert.ok(studentTenantCheck >= 0, 'student tenant check must exist');
    assert.ok(classTenantCheck >= 0, 'class tenant check must exist');
    assert.ok(pdfReuse > studentTenantCheck, 'student tenant consistency must be validated before reusing an existing PDF');
    assert.ok(pdfReuse > classTenantCheck, 'class tenant consistency must be validated before reusing an existing PDF');
});

test('payment-receipt reuses an existing PDF without exposing embedded context', () => {
    assert.match(source, /const \{ student_row: _studentRow, class_row: _classRow, \.\.\.publicReceipt \} = receipt/);
    assert.match(source, /if\s*\(receipt\.storage_path\)\s*return respond\(\{\s*receipt:\s*publicReceipt\s*\}\)/);
    assert.match(source, /upload\(storagePath,\s*pdfBytes,[\s\S]*?upsert:\s*true/);
    assert.match(source, /eq\(["']academy_id["'],\s*receipt\.academy_id\)/);
});
