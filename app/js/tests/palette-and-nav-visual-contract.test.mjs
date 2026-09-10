import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const tokens = fs.readFileSync(new URL('../../css/ui-v2/tokens.css', import.meta.url), 'utf8');
const layout = fs.readFileSync(new URL('../../css/ui-v2/layout.css', import.meta.url), 'utf8');
const dashboard = fs.readFileSync(new URL('../../css/ui-v2/pages/dashboard.css', import.meta.url), 'utf8');

test('theme exposes the approved Urban Loft and Spiced Mocha palettes', () => {
  for (const value of ['#000000', '#464646', '#A35E47', '#9C9A9A', '#F5F5DC', '#6F4E37', '#D47E30', '#6D3B07']) {
    assert.match(tokens, new RegExp(value, 'i'));
  }
  assert.match(tokens, /--accent-primary:\s*#A35E47/i);
  assert.match(tokens, /:root\[data-theme=["']light["']\][\s\S]*--accent-primary:\s*#D47E30/i);
});

test('desktop sidebar hover never repositions icon or label', () => {
  const hoverBlock = layout.match(
    /\.app-sidebar \.app-sidebar-nav\.view-tabs \.view-tab:hover \.view-tab-icon,[\s\S]*?\.view-tab:focus-visible \.view-tab-label\s*\{([^}]*)\}/s
  );
  assert.ok(hoverBlock, 'missing stable UI v2 sidebar hover/focus rule');
  assert.match(hoverBlock[1], /transform:\s*none/);
});

test('dashboard students icon is rendered as a monochrome theme icon', () => {
  assert.match(dashboard, /\.dashboard-stat-icon::before\s*\{[^}]*background:\s*currentColor/s);
  assert.match(dashboard, /\.dashboard-stat-icon::before\s*\{[^}]*mask:\s*var\(--dashboard-icon\)/s);
  assert.match(dashboard, /\.dashboard-stat-icon--students\s*\{[^}]*--dashboard-icon:\s*url\(/s);
});
