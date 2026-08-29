import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const source = fs.readFileSync(
    new URL('../../../supabase/functions/payment-lifecycle/index.ts', import.meta.url),
    'utf8'
);

test('payment lifecycle loads academy_id with the student', () => {
    assert.match(
        source,
        /select\(["']id,user_id,academy_id,class_id,person1,person2,entry_payments,payments,fees,person1_phone,person2_phone,person1_whatsapp_consent,person2_whatsapp_consent["']\)/,
        'student lookup must include academy_id'
    );
});

test('payment events inherit the student academy_id', () => {
    assert.match(
        source,
        /payment_events[\s\S]*?insert\(\{[\s\S]*?academy_id:\s*student\.academy_id[\s\S]*?\}\)/,
        'payment_events insert must include academy_id from the student'
    );
});

test('receipts inherit the student academy_id', () => {
    assert.match(
        source,
        /receipts[\s\S]*?insert\(\{[\s\S]*?academy_id:\s*student\.academy_id[\s\S]*?\}\)/,
        'receipts insert must include academy_id from the student'
    );
});
