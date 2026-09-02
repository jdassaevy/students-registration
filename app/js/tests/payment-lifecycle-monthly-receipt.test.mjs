import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const source = fs.readFileSync(
    new URL('../../../supabase/functions/payment-lifecycle/index.ts', import.meta.url),
    'utf8'
);

test('monthly PDF generation is delegated with the original auth context', () => {
    assert.match(source, /monthly-receipt-delegation\.mjs/);
    assert.match(
        source,
        /requestMonthlyReceiptPdf\(\{[\s\S]*?supabaseUrl[\s\S]*?anonKey[\s\S]*?authHeader[\s\S]*?receiptId:\s*receipt\.id/
    );
});

test('registration keeps direct PDF generation while monthly delegates it', () => {
    assert.match(
        source,
        /if\s*\(paid\s*&&\s*kind\s*===\s*["']entry["']\s*&&\s*receiptNeedsPdf\(receipt\)\)[\s\S]*?generateReceiptPdf/
    );
    assert.match(
        source,
        /if\s*\(paid\s*&&\s*kind\s*===\s*["']monthly["']\s*&&\s*receipt\)[\s\S]*?requestMonthlyReceiptPdf/
    );
});

test('monthly PDF failure becomes partial success instead of payment failure', () => {
    assert.match(source, /let\s+pdfStatus[^=]*=\s*["']not_applicable["']/);
    assert.match(source, /catch\s*\([^)]*\)\s*\{[\s\S]*?pdfStatus\s*=\s*["']pending["']/);
    assert.match(source, /pdf_status:\s*pdfStatus/);
});

test('repair operation validates the receipt and never sends payment confirmation', () => {
    const start = source.indexOf('operation === "repair_monthly_receipt"');
    const end = source.indexOf('const studentId =', start);
    assert.ok(start >= 0, 'repair operation branch must exist');
    assert.ok(end > start, 'repair operation must be handled before normal payment parsing');
    const repairBlock = source.slice(start, end);
    assert.match(repairBlock, /receipt\.kind\s*!==\s*["']monthly["']/);
    assert.match(repairBlock, /receipt\.status\s*!==\s*["']active["']/);
    assert.match(repairBlock, /academy_members/);
    assert.match(repairBlock, /requestMonthlyReceiptPdf/);
    assert.doesNotMatch(repairBlock, /TEMPLATE_NAMES\.paymentConfirmation/);
    assert.doesNotMatch(repairBlock, /["']payment_confirmation["']/);
    assert.match(repairBlock, /action:\s*["']repair(?:_pending)?["']/);
});

test('receipt document delivery requires a generated storage path', () => {
    assert.match(
        source,
        /settings\.receipt_delivery_enabled\s*&&\s*receipt\.storage_path[\s\S]*?receipt_document/
    );
});
