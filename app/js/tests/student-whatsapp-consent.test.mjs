import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

const moduleUrl = new URL('../features/student-whatsapp-contact.js', import.meta.url);
const configUrl = new URL('../core/supabase-config.js', import.meta.url);

test('student contact helper normalizes phone and preserves consent timestamp', () => {
    assert.ok(fs.existsSync(moduleUrl), 'student-whatsapp-contact.js must exist');
    const context = { window: {}, module: { exports: {} }, console };
    vm.createContext(context);
    vm.runInContext(fs.readFileSync(moduleUrl, 'utf8'), context);
    const api = context.module.exports;

    assert.equal(api.normalizePhone('(48) 99999-9999'), '5548999999999');
    assert.equal(api.normalizePhone('123'), null);
    assert.equal(
        api.resolveConsentTimestamp(true, true, '2026-08-20T12:00:00.000Z', '2026-09-01T12:00:00.000Z'),
        '2026-08-20T12:00:00.000Z'
    );
    assert.equal(api.resolveConsentTimestamp(false, true, null, '2026-09-01T12:00:00.000Z'), '2026-09-01T12:00:00.000Z');
    assert.equal(api.resolveConsentTimestamp(true, false, '2026-08-20T12:00:00.000Z'), null);
});

test('student contact module exposes optional WhatsApp and consent for both people', () => {
    assert.ok(fs.existsSync(moduleUrl), 'student-whatsapp-contact.js must exist');
    const source = fs.readFileSync(moduleUrl, 'utf8');
    for (const id of ['p1Phone', 'p1WhatsappConsent', 'p2Phone', 'p2WhatsappConsent']) {
        assert.match(source, new RegExp(id));
    }
    assert.match(source, /'primeira pessoa'/);
    assert.match(source, /'segunda pessoa'/);
    assert.match(source, /WhatsApp da \$\{label\} \(opcional\)/);
    assert.match(source, /Aluno autorizou o recebimento de lembretes, confirmações de pagamento e recibos pelo WhatsApp/);
});

test('student contact save persists phone consent and consent timestamps', () => {
    assert.ok(fs.existsSync(moduleUrl), 'student-whatsapp-contact.js must exist');
    const source = fs.readFileSync(moduleUrl, 'utf8');
    assert.match(source, /from\(['"]students['"]\)/);
    for (const field of [
        'person1_phone', 'person2_phone',
        'person1_whatsapp_consent', 'person2_whatsapp_consent',
        'person1_whatsapp_consent_at', 'person2_whatsapp_consent_at'
    ]) {
        assert.match(source, new RegExp(field));
    }
    assert.match(source, /PaymentAutomation\?\.processSavedStudent/);
});

test('new contact module is loaded while legacy academy settings stays disabled', () => {
    const source = fs.readFileSync(configUrl, 'utf8');
    assert.match(source, /student-whatsapp-contact\.js/);
    assert.doesNotMatch(source, /academy-settings\.js/);
    assert.doesNotMatch(source, /loadAcademySettings/);
});
