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

test('payment-receipt authorizes through active academy membership', () => {
    assert.match(source, /from\(["']academy_members["']\)/);
    assert.match(source, /eq\(["']academy_id["'],\s*receipt\.academy_id\)/);
    assert.match(source, /eq\(["']user_id["'],\s*user\.id\)/);
    assert.match(source, /eq\(["']is_active["'],\s*true\)/);
    assert.doesNotMatch(source, /receipt\.user_id\s*!==\s*user\.id/);
});

test('payment-receipt uses tenant academy identity', () => {
    assert.match(source, /from\(["']academies["']\)/);
    assert.match(source, /select\(["']name,display_name,responsible_name,support_phone["']\)/);
    assert.match(source, /eq\(["']id["'],\s*receipt\.academy_id\)/);
    assert.doesNotMatch(source, /from\(["']academy_profiles["']\)/);
    assert.match(source, /academyName:\s*academy\.name/);
});

test('payment-receipt fails closed on student and class tenant mismatches before PDF reuse', () => {
    assert.match(source, /select\(["']id,person1,person2,academy_id["']\)/);
    assert.match(source, /student\.academy_id\s*!==\s*receipt\.academy_id/);
    assert.match(source, /select\(["']name,academy_id["']\)/);
    assert.match(source, /classRow\.academy_id\s*!==\s*receipt\.academy_id/);

    const studentTenantCheck = source.indexOf('student.academy_id !== receipt.academy_id');
    const pdfReuse = source.indexOf('if (receipt.storage_path)');
    assert.ok(studentTenantCheck >= 0, 'student tenant check must exist');
    assert.ok(pdfReuse > studentTenantCheck, 'tenant consistency must be validated before reusing an existing PDF');
});

test('payment-receipt reuses an existing PDF before generating another one', () => {
    assert.match(source, /if\s*\(receipt\.storage_path\)\s*return json\(\{\s*receipt\s*\}\)/);
    assert.match(source, /upload\(storagePath,\s*pdfBytes,[\s\S]*?upsert:\s*true/);
    assert.match(source, /eq\(["']academy_id["'],\s*receipt\.academy_id\)/);
});
