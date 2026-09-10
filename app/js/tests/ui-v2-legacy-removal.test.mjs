import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const read = path => fs.readFileSync(new URL(path, import.meta.url), 'utf8');
const index = read('../../index.html');

const legacyFiles = [
  './css/style.css',
  './css/style-base.css',
  './css/custom-select-fix.css',
  './css/app-shell.css',
  './css/design-tokens.css',
  './css/ui-states.css',
  './css/auth-surface.css',
  './css/academy-profile.css',
  './css/academy-onboarding.css'
];

for (const legacy of legacyFiles) {
  test(`final UI does not load ${legacy}`, () => {
    assert.ok(!index.includes(legacy), `${legacy} is still loaded by index.html`);
  });
}

test('dashboard reports and automation inject no presentation CSS', () => {
  for (const path of [
    '../features/dashboard.js',
    '../features/reports.js',
    '../features/automation-center.js'
  ]) {
    const js = read(path);
    assert.doesNotMatch(js, /createElement\(['"]style['"]\)/);
    assert.doesNotMatch(js, /style\.textContent\s*=/);
  }
});

test('critical functional modules remain loaded', () => {
  for (const src of [
    './js/core/script.js',
    './js/core/academy-context.js',
    './js/core/academy-data-context.js',
    './js/core/academy-onboarding.js',
    './js/features/payment-automation.js',
    './js/features/dashboard.js',
    './js/features/reports.js',
    './js/features/automation-center.js',
    './js/features/academy-profile.js'
  ]) {
    assert.ok(index.includes(src), `missing ${src}`);
  }
});
