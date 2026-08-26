import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const indexSource = readFileSync(new URL('../../index.html', import.meta.url), 'utf8');
const runtimeSource = readFileSync(new URL('../features/registration-ui.js', import.meta.url), 'utf8');

test('registration fields are present in the primary auth form', () => {
  for (const id of ['registerAcademyFields', 'signupAcademyName', 'signupResponsibleName', 'signupPhone', 'signupEmail', 'signupPassword', 'signupPasswordConfirm']) {
    assert.match(indexSource, new RegExp(`id=["']${id}["']`));
  }
  assert.match(indexSource, /registration-ui\.js/);
});

test('registration runtime owns register mode and metadata signup', () => {
  assert.match(runtimeSource, /toggleAuthMode/);
  assert.match(runtimeSource, /stopImmediatePropagation/);
  assert.match(runtimeSource, /academy_name\s*:/);
  assert.match(runtimeSource, /responsible_name\s*:/);
  assert.match(runtimeSource, /phone(?:\s*:|\s*[,}])/);
  assert.match(runtimeSource, /signupPasswordConfirm/);
  assert.match(runtimeSource, /authEmail\.required\s*=\s*!enabled/);
  assert.match(runtimeSource, /authPassword\.required\s*=\s*!enabled/);
  assert.match(runtimeSource, /emailRedirectTo\s*:\s*window\.location\.origin/);
});
