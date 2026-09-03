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

test('payment confirmation matches the four approved Meta template variables in order', () => {
    const start = source.indexOf('templateName: TEMPLATE_NAMES.paymentConfirmation');
    const end = source.indexOf('whatsapp.payment_confirmation', start);
    assert.ok(start >= 0, 'payment confirmation template block must exist');
    assert.ok(end > start, 'payment confirmation send must follow template construction');
    const confirmationBlock = source.slice(start, end);

    assert.match(
        confirmationBlock,
        /bodyParameters:\s*\[studentName,\s*label,\s*money\(notificationAmount\),\s*academyMessageName\]/
    );
    assert.doesNotMatch(confirmationBlock, /receipt\.receipt_number/);
    assert.doesNotMatch(confirmationBlock, /academy\.responsible_name/);
    assert.doesNotMatch(confirmationBlock, /academy\.support_phone/);
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

test('repair fails closed when receipt student belongs to another academy', () => {
    const start = source.indexOf('operation === "repair_monthly_receipt"');
    const end = source.indexOf('const studentId =', start);
    const repairBlock = source.slice(start, end);
    assert.match(repairBlock, /select\(["']id,class_id,academy_id,person1,person2,person1_phone,person2_phone,person1_whatsapp_consent,person2_whatsapp_consent["']\)/);
    assert.match(repairBlock, /repairStudent\.academy_id\s*!==\s*receipt\.academy_id/);
});

test('receipt document delivery requires a generated storage path', () => {
    assert.match(
        source,
        /settings\.receipt_delivery_enabled\s*&&\s*receipt\.storage_path[\s\S]*?receipt_document/
    );
});
