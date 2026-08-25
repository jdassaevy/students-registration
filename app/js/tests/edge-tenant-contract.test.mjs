import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const lifecycle = readFileSync(new URL('../../../supabase/functions/payment-lifecycle/index.ts', import.meta.url), 'utf8');
const receipt = readFileSync(new URL('../../../supabase/functions/payment-receipt/index.ts', import.meta.url), 'utf8');
const tenant = readFileSync(new URL('../../../supabase/functions/_shared/tenant.ts', import.meta.url), 'utf8');

test('payment edge functions authorize using academy access', () => {
    assert.match(lifecycle, /requireAcademyAccess/);
    assert.match(receipt, /requireAcademyAccess/);
    assert.doesNotMatch(lifecycle, /student\.user_id\s*!==\s*user\.id/);
    assert.doesNotMatch(receipt, /receipt\.user_id\s*!==\s*user\.id/);
});

test('payment edge functions use academy identity rather than legacy academy_profiles', () => {
    assert.doesNotMatch(lifecycle, /academy_profiles/);
    assert.doesNotMatch(receipt, /academy_profiles/);
    assert.match(lifecycle, /loadAcademyIdentity/);
    assert.match(receipt, /loadAcademyIdentity/);
});

test('tenant helper supports membership and active audited support', () => {
    assert.match(tenant, /academy_members/);
    assert.match(tenant, /support_access_logs/);
    assert.match(tenant, /platform_admin/);
    assert.match(tenant, /loadAcademyIdentity/);
});
