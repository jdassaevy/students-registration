import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const read = relative => readFileSync(new URL(relative, import.meta.url), 'utf8');
const lifecycle = read('../../../supabase/functions/payment-lifecycle/index.ts');
const receipt = read('../../../supabase/functions/payment-receipt/index.ts');
const sendWhatsapp = read('../../../supabase/functions/send-whatsapp/index.ts');
const reminders = read('../../../supabase/functions/process-reminders/index.ts');
const retry = read('../../../supabase/functions/retry-automation-message/index.ts');
const tenant = read('../../../supabase/functions/_shared/tenant.ts');

test('interactive edge functions authorize using academy access', () => {
    for (const source of [lifecycle, receipt, sendWhatsapp, retry]) {
        assert.match(source, /requireAcademyAccess/);
    }
    assert.doesNotMatch(lifecycle, /student\.user_id\s*!==\s*user\.id/);
    assert.doesNotMatch(receipt, /receipt\.user_id\s*!==\s*user\.id/);
    assert.doesNotMatch(sendWhatsapp, /student\.user_id\s*!==\s*user\.id/);
    assert.doesNotMatch(retry, /source\.user_id\s*!==\s*user\.id/);
});

test('payment and reminder flows use academy identity rather than legacy academy_profiles', () => {
    for (const source of [lifecycle, receipt, reminders, retry]) {
        assert.doesNotMatch(source, /academy_profiles/);
    }
    assert.match(lifecycle, /loadAcademyIdentity/);
    assert.match(receipt, /loadAcademyIdentity/);
    assert.match(reminders, /academy_id/);
    assert.match(retry, /loadAcademyIdentity/);
});

test('automation logs carry academy_id', () => {
    for (const source of [lifecycle, sendWhatsapp, reminders, retry]) {
        assert.match(source, /academy_id/);
    }
});

test('tenant helper supports membership and active audited support', () => {
    assert.match(tenant, /academy_members/);
    assert.match(tenant, /support_access_logs/);
    assert.match(tenant, /platform_admin/);
    assert.match(tenant, /loadAcademyIdentity/);
});
