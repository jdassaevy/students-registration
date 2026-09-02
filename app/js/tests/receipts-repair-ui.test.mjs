import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const source = fs.readFileSync(
    new URL('../features/receipts.js', import.meta.url),
    'utf8'
);

test('receipt history exposes repair only for repairable receipts', () => {
    assert.match(source, /data-repair-receipt/);
    assert.match(source, />Gerar PDF</);
    assert.match(source, /canRepairReceipt\(item\)/);
});

test('repair disables the button while lifecycle request is pending', () => {
    assert.match(source, /button\.disabled\s*=\s*true/);
    assert.match(source, /button\.disabled\s*=\s*false/);
});

test('repair delegates to payment lifecycle and reloads receipts', () => {
    assert.match(source, /repairMonthlyReceipt/);
    assert.match(source, /operation:\s*["']repair_monthly_receipt["']/);
    assert.match(source, /receipt_id:/);
    assert.match(source, /api\.load\(\)/);
});
