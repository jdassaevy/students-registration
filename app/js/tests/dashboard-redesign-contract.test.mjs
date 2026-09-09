import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const indexUrl = new URL('../../index.html', import.meta.url);
const coreUrl = new URL('../core/script.js', import.meta.url);
const index = () => fs.readFileSync(indexUrl, 'utf8');
const core = () => fs.readFileSync(coreUrl, 'utf8');

const criticalIds = [
  'authView', 'appView', 'authForm', 'authEmail', 'authPassword',
  'authSubmit', 'userEmail', 'academyProfileBtn', 'logoutBtn',
  'studentsTab', 'financialTab', 'studentsView', 'financialView',
  'search', 'classFilter', 'exportClassBtn', 'newClassBtn', 'newBtn',
  'list', 'financialClassFilter', 'financialList',
  'modal', 'form', 'classModal', 'classForm', 'toast'
];

test('redesign keeps existing DOM contracts used by business logic', () => {
  const html = index();
  for (const id of criticalIds) {
    assert.match(html, new RegExp(`id=["']${id}["']`), `missing #${id}`);
  }
});

test('redesign keeps existing functional module includes', () => {
  const html = index();
  for (const src of [
    './js/core/script.js',
    './js/core/academy-context.js',
    './js/core/academy-data-context.js',
    './js/features/academy-profile.js',
    './js/features/payment-automation.js',
    './js/features/dashboard.js',
    './js/features/reports.js',
    './js/features/automation-center.js'
  ]) {
    assert.ok(html.includes(src), `missing script ${src}`);
  }
});

test('core still owns current loading and view behavior', () => {
  const source = core();
  assert.match(source, /let activeView\s*=\s*['"]students['"]/);
  assert.match(source, /function setLoading\(/);
  assert.match(source, /function animateView\(/);
});
