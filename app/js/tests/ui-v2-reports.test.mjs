import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

const read = p => fs.readFileSync(new URL(p, import.meta.url), 'utf8');
const readOptional = p => {
  const url = new URL(p, import.meta.url);
  return fs.existsSync(url) ? fs.readFileSync(url, 'utf8') : '';
};

const js = read('../features/reports.js');
const css = readOptional('../../css/ui-v2/pages/reports.css');
const index = read('../../index.html');

test('reports feature stays parseable so its browser hooks can run', () => {
  assert.doesNotThrow(
    () => new vm.Script(js),
    'reports.js must be valid JavaScript before presentation code can run'
  );
});

test('reports no longer injects presentation CSS', () => {
  assert.doesNotMatch(js, /createElement\(['"]style['"]\)/);
  assert.doesNotMatch(js, /style\.textContent\s*=/);
});

test('reports keeps existing calculation and payment history ownership', () => {
  for (const contract of [
    'function reportMetrics(',
    'function classRows(',
    'function revenueSeries(',
    'async function syncPaymentEvent(',
    ".from('payment_events')"
  ]) assert.ok(js.includes(contract), `missing report contract: ${contract}`);
});

test('charts use semantic UI v2 variables', () => {
  for (const token of ['--accent-primary', '--status-success', '--text-muted', '--border-default']) {
    assert.ok(js.includes(token), `missing semantic chart token ${token}`);
  }
  assert.doesNotMatch(js, /getPropertyValue\(['"]--wine['"]\)/);
  assert.doesNotMatch(js, /getPropertyValue\(['"]--terracotta['"]\)/);
});

test('reports exposes chart-shaped loading skeletons', () => {
  assert.match(js, /reports-chart-skeleton/);
  assert.match(js, /setReportsChartLoading\(/);
  assert.match(css, /\.reports-chart-skeleton/);
});

test('reports page owns a semantic UI v2 layer without legacy glass or serif styling', () => {
  assert.match(css, /var\(--surface-card\)/);
  assert.match(css, /var\(--surface-elevated\)/);
  assert.match(css, /var\(--accent-primary\)/);
  assert.doesNotMatch(css, /font-family\s*:\s*Georgia/i);
  assert.doesNotMatch(css, /backdrop-filter/i);
  assert.doesNotMatch(css, /background\s*:\s*(?:white|#fff(?:fff)?)/i);
});

test('reports stylesheet loads after the financial page layer', () => {
  const financial = index.indexOf('./css/ui-v2/pages/financial.css');
  const reports = index.indexOf('./css/ui-v2/pages/reports.css');
  assert.ok(financial >= 0, 'financial stylesheet missing');
  assert.ok(reports > financial, 'reports stylesheet must load after financial.css');
});
