import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const lifecycle = fs.readFileSync(
    new URL('../../../supabase/functions/payment-lifecycle/index.ts', import.meta.url),
    'utf8'
);
const reminders = fs.readFileSync(
    new URL('../../../supabase/functions/process-reminders/index.ts', import.meta.url),
    'utf8'
);
const retry = fs.readFileSync(
    new URL('../../../supabase/functions/retry-automation-message/index.ts', import.meta.url),
    'utf8'
);

test('reminder processing loads active students only', () => {
    assert.match(
        reminders,
        /from\(["']students["']\)[\s\S]{0,420}?\.is\(["']archived_at["'],\s*null\)[\s\S]{0,180}?\.not\(["']class_id["'],\s*["']is["'],\s*null\)/,
        'process-reminders must exclude archived students before building candidates'
    );
});

test('normal payment lifecycle loads only active students', () => {
    assert.match(
        lifecycle,
        /const \{ data: student, error: studentError \}[\s\S]{0,850}?from\(["']students["']\)[\s\S]{0,560}?\.eq\(["']id["'],\s*studentId\)\s*\.is\(["']archived_at["'],\s*null\)\s*\.single\(\)/,
        'normal lifecycle lookup must reject archived students before payment side effects'
    );
});

test('receipt repair keeps archived rows for PDF maintenance but blocks new document send', () => {
    assert.match(
        lifecycle,
        /select\(["']id,class_id,academy_id,archived_at,person1,person2,person1_phone,person2_phone,person1_whatsapp_consent,person2_whatsapp_consent["']\)/,
        'repair lookup must load archived_at without filtering the historical student out'
    );
    assert.match(
        lifecycle,
        /const repairStudentArchived = Boolean\(repairStudent\.archived_at\)/,
        'repair flow must resolve archived state explicitly'
    );
    assert.match(
        lifecycle,
        /repairEligible\s*&&\s*repairMetaReady\s*&&\s*repairSettings\.receipt_delivery_enabled\s*&&\s*!repairStudentArchived\s*&&\s*repairedReceipt\.storage_path/,
        'archived historical students must not receive a new repair WhatsApp document'
    );
});

test('retry backend loads only active students', () => {
    assert.match(
        retry,
        /from\(["']students["']\)[\s\S]{0,520}?\.eq\(["']id["'],\s*source\.student_id\)\s*\.is\(["']archived_at["'],\s*null\)\s*\.single\(\)/,
        'direct retry invocation must reject archived students'
    );
});
