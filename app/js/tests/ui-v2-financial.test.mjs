import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const read = path => fs.readFileSync(new URL(path, import.meta.url), 'utf8');
const readMaybe = path => {
  try {
    return read(path);
  } catch {
    return '';
  }
};

const index = read('../../index.html');
const core = read('../core/script.js');
const financialUi = readMaybe('../features/financial-ui.js');
const css = readMaybe('../../css/ui-v2/pages/financial.css');

test('financial keeps the existing business-logic targets and adds a mobile cards surface', () => {
  for (const id of [
    'financialView',
    'financialClassFilter',
    'financialTotal',
    'financialEntries',
    'financialMonthly',
    'financialPayments',
    'financialList'
  ]) {
    assert.match(index, new RegExp(`id=["']${id}["']`));
  }
  assert.match(index, /id=["']financialCards["']/);
  assert.match(index, /financial-page-head/);
  assert.match(index, /financial-kicker/);
  assert.match(index, /financial-table-wrap/);
});

test('financial presentation mirrors rendered rows without taking ownership of finance data', () => {
  assert.match(financialUi, /MutationObserver/);
  assert.match(financialUi, /financialList/);
  assert.match(financialUi, /financialCards/);
  assert.match(financialUi, /renderFinancialCards/);
  assert.doesNotMatch(financialUi, /\.from\(/);
  assert.doesNotMatch(financialUi, /\bdb\b/);
  assert.doesNotMatch(financialUi, /\bcouples\b/);

  assert.match(core, /function financialValues\(/);
  assert.match(core, /function renderFinancial\(/);
  assert.match(core, /\$\(['"]financialClassFilter['"]\)\.onchange\s*=\s*renderFinancial/);
});

test('financial initial loading mirrors metric cells and mobile records', () => {
  assert.match(financialUi, /function renderFinancialLoading\(/);
  assert.match(financialUi, /financial-loading-row/);
  assert.match(financialUi, /financial-card-skeleton/);
  assert.match(financialUi, /ui-skeleton/);
});

test('financial page owns a semantic UI v2 layer loaded after students', () => {
  const students = index.indexOf('./css/ui-v2/pages/students.css');
  const financial = index.indexOf('./css/ui-v2/pages/financial.css');
  assert.ok(financial >= 0, 'financial.css must be loaded');
  assert.ok(financial > students, 'financial.css must load after students.css');
  assert.match(css, /var\(--surface-card\)/);
  assert.match(css, /var\(--accent-primary\)/);
  assert.doesNotMatch(css, /background:\s*(?:#fff(?:fff)?|white)\b/i);
});

test('financial featured metric stays neutral and suppresses the legacy diagonal glare', () => {
  assert.match(css, /\.financial-stats \.stat\.featured\s*\{[^}]*background:\s*var\(--surface-card\)/s);
  assert.match(css, /\.financial-stats \.stat\.featured::before\s*\{[^}]*background:\s*var\(--accent-primary\)/s);
  assert.match(css, /\.financial-stats \.stat::after\s*\{[^}]*content:\s*none/s);
});

test('mobile financial layout swaps the desktop table for finance cards', () => {
  assert.match(css, /@media[^\{]*max-width:\s*768px[\s\S]*\.financial-table-wrap[\s\S]*display:\s*none/s);
  assert.match(css, /@media[^\{]*max-width:\s*768px[\s\S]*\.financial-cards[\s\S]*display:\s*grid/s);
});

test('financial UI module loads after core and before dashboard wrappers', () => {
  const coreIndex = index.indexOf('./js/core/script.js');
  const financialIndex = index.indexOf('./js/features/financial-ui.js');
  const dashboardIndex = index.indexOf('./js/features/dashboard.js');
  assert.ok(financialIndex > coreIndex, 'financial UI must load after core');
  assert.ok(financialIndex < dashboardIndex, 'financial UI must load before dashboard');
});
