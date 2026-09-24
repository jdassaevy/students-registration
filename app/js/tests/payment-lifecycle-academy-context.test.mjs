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


test('payment lifecycle resolves class context in the student read instead of a second classes request', () => {
    const normalStart = source.indexOf('const { studentId, person, kind, installment } = input;');
    assert.ok(normalStart >= 0, 'normal payment flow must exist');
    const normalFlow = source.slice(normalStart);

    assert.match(
        normalFlow,
        /select\(["']id,user_id,academy_id,class_id,[^"']*class_row:classes!students_class_id_fkey\(name,academy_id\)[^"']*["']\)/,
        'student lookup must embed class name and academy_id through the existing FK'
    );
    assert.doesNotMatch(
        normalFlow,
        /admin\.from\(["']classes["']\)\.select\(["']name,academy_id["']\)/,
        'normal payment flow must not issue a second classes read'
    );
});

test('embedded class context still fails closed before payment writes and feeds entry receipts', () => {
    const normalStart = source.indexOf('const { studentId, person, kind, installment } = input;');
    const paymentWrite = source.indexOf('let paymentEvent: any = null;', normalStart);
    const mismatchCheck = source.indexOf('student.class_row.academy_id !== student.academy_id', normalStart);

    assert.ok(mismatchCheck > normalStart, 'class tenant mismatch validation must exist');
    assert.ok(mismatchCheck < paymentWrite, 'class tenant mismatch must be checked before payment writes');
    assert.match(source, /className:\s*student\.class_row\?\.name\s*\|\|\s*["']Sem turma["']/);
});
