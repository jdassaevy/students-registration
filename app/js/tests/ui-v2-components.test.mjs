import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const read = path => fs.readFileSync(new URL(path, import.meta.url), 'utf8');
const select = read('../features/custom-select.js');
const state = read('../features/ui-state.js');
const css = read('../../css/ui-v2/components.css');

test('custom select stops injecting legacy CSS', () => {
  assert.doesNotMatch(select, /custom-select-fix\.css/);
  assert.doesNotMatch(select, /createElement\(['"]link['"]\)/);
});

test('custom select is theme aware', () => {
  assert.match(css, /\.custom-select-trigger[\s\S]*var\(--surface-input\)/s);
  assert.match(css, /\.custom-select-menu[\s\S]*var\(--surface-elevated\)/s);
});

test('UI state exposes reusable loading state', () => {
  assert.match(state, /function setLoadingState\(/);
  assert.match(state, /setLoadingState/);
});
