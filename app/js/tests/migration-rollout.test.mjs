import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const here = dirname(fileURLToPath(import.meta.url));
const root = resolve(here, '../../..');
const migrations = [
    'supabase/migrations/20260825180500_multi_academy_foundation.sql',
    'supabase/migrations/20260825180600_multi_academy_support_profile.sql',
    'supabase/migrations/20260825180700_multi_academy_legacy_bridge.sql',
    'supabase/migrations/20260825180800_multi_academy_automation.sql',
    'supabase/migrations/20260825180900_academy_logo_storage.sql',
    'supabase/migrations/20260825181000_multi_academy_receipts_storage.sql'
];

test('all multi-academy rollout migrations are committed in deterministic order', () => {
    for (const path of migrations) assert.equal(existsSync(resolve(root, path)), true, `missing ${path}`);
});

test('foundation precedes support and support precedes the legacy bridge', () => {
    const foundation = readFileSync(resolve(root, migrations[0]), 'utf8').toLowerCase();
    const support = readFileSync(resolve(root, migrations[1]), 'utf8').toLowerCase();
    const bridge = readFileSync(resolve(root, migrations[2]), 'utf8').toLowerCase();
    assert.match(foundation, /create table if not exists public\.academies/);
    assert.match(foundation, /has_active_support_access/);
    assert.match(support, /has_active_support_for_user/);
    assert.match(bridge, /has_active_support_for_user/);
});

test('automation and storage migrations depend on academy tenant helpers', () => {
    const automation = readFileSync(resolve(root, migrations[3]), 'utf8').toLowerCase();
    const logos = readFileSync(resolve(root, migrations[4]), 'utf8').toLowerCase();
    const receipts = readFileSync(resolve(root, migrations[5]), 'utf8').toLowerCase();
    assert.match(automation, /academy_id/);
    assert.match(automation, /is_academy_member/);
    assert.match(logos, /is_academy_owner/);
    assert.match(receipts, /is_academy_member/);
});
