import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const source = readFileSync(new URL('../features/profile-onboarding.js', import.meta.url), 'utf8');

test('registration onboarding defines all required professor fields', () => {
    for (const id of ['signupAcademyName', 'signupResponsibleName', 'signupPhone', 'signupEmail', 'signupPassword', 'signupPasswordConfirm']) {
        assert.match(source, new RegExp(`id=["']${id}["']`));
    }
});

test('legacy onboarding is blocking and uses AcademyContext.bootstrap', () => {
    assert.match(source, /profileOnboardingModal/);
    assert.match(source, /showModal\s*\(/);
    assert.match(source, /AcademyContext\.bootstrap\s*\(/);
    assert.match(source, /AcademyContext\.resolve\s*\(/);
});

test('public registration never submits platform role', () => {
    assert.doesNotMatch(source, /platform_role\s*:/);
    assert.doesNotMatch(source, /platform_admin/);
});
