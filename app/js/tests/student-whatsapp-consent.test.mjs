import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

const moduleUrl = new URL('../core/student-contact.js', import.meta.url);
const indexUrl = new URL('../../index.html', import.meta.url);
const scriptUrl = new URL('../core/script.js', import.meta.url);

test('student contact helper normalizes phone and preserves consent timestamp', () => {
    assert.ok(fs.existsSync(moduleUrl), 'student-contact.js must exist');
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

test('student form exposes optional WhatsApp and consent for both people', () => {
    const html = fs.readFileSync(indexUrl, 'utf8');
    for (const id of ['p1Phone', 'p1WhatsappConsent', 'p2Phone', 'p2WhatsappConsent']) {
        assert.match(html, new RegExp(`id="${id}"`));
    }
    assert.match(html, /Aluno autorizou o recebimento de lembretes, confirmações de pagamento e recibos pelo WhatsApp/);
    assert.match(html, /WhatsApp da primeira pessoa \(opcional\)/);
    assert.match(html, /WhatsApp da segunda pessoa \(opcional\)/);
});

test('core student save persists phone consent and consent timestamps', () => {
    const source = fs.readFileSync(scriptUrl, 'utf8');
    assert.match(source, /StudentContact\.buildContactPayload/);
    for (const field of [
        'person1_phone', 'person2_phone',
        'person1_whatsapp_consent', 'person2_whatsapp_consent',
        'person1_whatsapp_consent_at', 'person2_whatsapp_consent_at'
    ]) {
        assert.match(source, new RegExp(field));
    }
});

test('legacy academy settings loader stays disabled', () => {
    const source = fs.readFileSync(new URL('../core/supabase-config.js', import.meta.url), 'utf8');
    assert.doesNotMatch(source, /academy-settings\.js/);
    assert.doesNotMatch(source, /loadAcademySettings/);
});
