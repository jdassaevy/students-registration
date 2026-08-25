import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const indexSource = readFileSync(new URL('../../index.html', import.meta.url), 'utf8');
const scriptSource = readFileSync(new URL('../core/script.js', import.meta.url), 'utf8');

test('registration fields are present in the primary auth form', () => {
  for (const id of ['registerAcademyFields', 'signupAcademyName', 'signupResponsibleName', 'signupPhone', 'signupEmail', 'signupPassword', 'signupPasswordConfirm']) {
    assert.match(indexSource, new RegExp(`id=["']${id}["']`));
  }
});

test('primary auth mode controls registration fields and metadata signup', () => {
  assert.match(scriptSource, /registerAcademyFields/);
  assert.match(scriptSource, /academy_name\s*:/);
  assert.match(scriptSource, /responsible_name\s*:/);
  assert.match(scriptSource, /phone\s*:/);
  assert.match(scriptSource, /signupPasswordConfirm/);
});
