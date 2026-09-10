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

const js = read('../features/dashboard.js');
const css = readMaybe('../../css/ui-v2/pages/dashboard.css');
const index = read('../../index.html');

test('dashboard no longer injects page CSS', () => {
  assert.doesNotMatch(js, /createElement\(['"]style['"]\)/);
  assert.doesNotMatch(js, /style\.textContent\s*=/);
});

test('dashboard uses semantic UI v2 surfaces with one featured metric', () => {
  assert.match(css, /\.dashboard-stat-card[\s\S]*background:\s*var\(--surface-card\)/s);
  assert.match(css, /\.dashboard-stat-featured[\s\S]*background:\s*var\(--accent-primary\)/s);
  assert.doesNotMatch(css, /font-family:\s*Georgia/i);
  assert.doesNotMatch(css, /border-color:\s*#fff/i);
});

test('dashboard includes geometry-matched skeletons', () => {
  assert.match(js, /dashboard-skeleton/);
  assert.match(css, /\.dashboard-skeleton/);
});

test('dashboard page stylesheet is loaded after UI v2 shared layers', () => {
  const shared = index.indexOf('./css/ui-v2/components.css');
  const page = index.indexOf('./css/ui-v2/pages/dashboard.css');
  assert.ok(page >= 0, 'dashboard.css must be loaded');
  assert.ok(page > shared, 'dashboard.css must load after shared components');
});
