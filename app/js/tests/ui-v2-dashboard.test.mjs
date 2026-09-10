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

test('dashboard uses semantic UI v2 surfaces without a large accent slab', () => {
  const revenueCardRule = css.match(/\.dashboard-revenue-card\s*\{([^}]*)\}/s)?.[1] ?? '';
  assert.match(revenueCardRule, /background:\s*var\(--surface-card\)/);
  assert.doesNotMatch(revenueCardRule, /background:\s*var\(--accent-primary\)/);
  assert.match(css, /\.dashboard-revenue-card::before\s*\{[^}]*background:\s*var\(--accent-primary\)/s);
  assert.doesNotMatch(css, /font-family:\s*Georgia/i);
  assert.doesNotMatch(css, /border-color:\s*#fff/i);
});

test('dashboard uses an asymmetric fintech command layout', () => {
  assert.match(js, /dashboard-command-grid/);
  assert.match(js, /dashboard-revenue-card/);
  assert.match(js, /dashboard-kpi-stack/);
  assert.match(js, /dashboard-kpi-grid/);
  assert.match(js, /dashboard-pending-card/);
  assert.match(css, /\.dashboard-command-grid[\s\S]*grid-template-columns:\s*minmax\(0,\s*1\.5fr\)\s+minmax\(300px,\s*\.75fr\)/s);
});

test('dashboard greeting is integrated into the page header and active view can use the full canvas', () => {
  assert.match(js, /dashboard-headline/);
  assert.doesNotMatch(js, /dashboard-hero panel/);
  assert.match(css, /\.app-main:has\(#dashboardView:not\(\[hidden\]\)\) \.app-topbar[\s\S]*display:\s*none/s);
  assert.match(css, /\.app-main > \.app:has\(> #dashboardView:not\(\[hidden\]\)\)[\s\S]*max-width:\s*none/s);
});

test('dashboard includes geometry-matched skeletons for the new composition', () => {
  assert.match(js, /dashboard-skeleton-command/);
  assert.match(js, /dashboard-skeleton-revenue/);
  assert.match(js, /dashboard-skeleton-kpis/);
  assert.match(css, /\.dashboard-skeleton-command/);
});

test('dashboard page stylesheet is loaded after UI v2 shared layers', () => {
  const shared = index.indexOf('./css/ui-v2/components.css');
  const page = index.indexOf('./css/ui-v2/pages/dashboard.css');
  assert.ok(page >= 0, 'dashboard.css must be loaded');
  assert.ok(page > shared, 'dashboard.css must load after shared components');
});
