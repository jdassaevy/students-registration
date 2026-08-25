import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const source = readFileSync(new URL('../features/automation-center-v2.js', import.meta.url), 'utf8');

test('automation center scopes settings, messages and students by academy', () => {
    assert.match(source, /getActiveAcademyId/);
    assert.match(source, /automation_settings[\s\S]*?academy_id/);
    assert.match(source, /automation_messages[\s\S]*?academy_id/);
    assert.match(source, /students[\s\S]*?academy_id/);
});

test('automation center readiness uses academies and profiles, not academy_profiles', () => {
    assert.match(source, /from\('academies'\)/);
    assert.match(source, /from\('profiles'\)/);
    assert.doesNotMatch(source, /academy_profiles/);
});

test('legacy automation module is only a recovery loader', () => {
    const legacy = readFileSync(new URL('../features/automation-center.js', import.meta.url), 'utf8');
    assert.match(legacy, /automation-center-v2\.js/);
    assert.doesNotMatch(legacy, /academy_profiles|automation_settings/);
});
