import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const receiptsSource = fs.readFileSync(
    new URL('../features/receipts.js', import.meta.url),
    'utf8'
);
const paymentAutomationSource = fs.readFileSync(
    new URL('../features/payment-automation.js', import.meta.url),
    'utf8'
);

test('receipt history exposes repair only for repairable receipts', () => {
    assert.match(receiptsSource, /data-repair-receipt/);
    assert.match(receiptsSource, />Gerar PDF</);
    assert.match(receiptsSource, /canRepairReceipt\(item\)/);
});

test('repair disables the button while lifecycle request is pending', () => {
    assert.match(receiptsSource, /button\.disabled\s*=\s*true/);
    assert.match(receiptsSource, /button\.disabled\s*=\s*false/);
});

test('receipt UI delegates repair while payment automation owns lifecycle payload', () => {
    assert.match(receiptsSource, /repairMonthlyReceipt/);
    assert.match(receiptsSource, /api\.load\(\)/);
    assert.match(paymentAutomationSource, /operation:\s*["']repair_monthly_receipt["']/);
    assert.match(paymentAutomationSource, /receipt_id:/);
});
