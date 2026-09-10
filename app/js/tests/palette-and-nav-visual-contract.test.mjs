import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const tokens = fs.readFileSync(new URL('../../css/design-tokens.css', import.meta.url), 'utf8');
const shell = fs.readFileSync(new URL('../../css/app-shell.css', import.meta.url), 'utf8');

test('theme exposes Narvik and Sorrell Brown as the primary palette', () => {
  assert.match(tokens, /--narvik:\s*#EAE7DD/i);
  assert.match(tokens, /--sorrell-brown:\s*#99775C/i);
  assert.match(tokens, /--brand-primary:\s*var\(--sorrell-brown\)/);
  assert.match(tokens, /--text-on-brand:\s*var\(--narvik\)/);
});

test('desktop sidebar hover never repositions icon or label', () => {
  assert.match(shell, /\.app-sidebar[\s\S]*\.view-tab:hover\s+\.view-tab-icon\s*\{[^}]*transform:\s*none/s);

  const labelHoverBlock = shell.match(
    /\.app-sidebar\s+\.app-sidebar-nav\.view-tabs\s+\.view-tab:hover\s+\.view-tab-label,\s*\.app-sidebar\s+\.app-sidebar-nav\.view-tabs\s+\.view-tab:focus-visible\s+\.view-tab-label\s*\{([^}]*)\}/s
  );
  assert.ok(labelHoverBlock, 'missing stable sidebar hover/focus label rule');
  assert.match(labelHoverBlock[1], /transform:\s*none/);
});

test('dashboard students icon is rendered as a monochrome theme icon', () => {
  assert.match(shell, /\.dashboard-stat-card:first-child\s+\.dashboard-stat-icon\s*\{[^}]*font-size:\s*0/s);
  assert.match(shell, /\.dashboard-stat-card:first-child\s+\.dashboard-stat-icon::before\s*\{[^}]*mask(?:-image)?:/s);
  assert.match(shell, /\.dashboard-stat-card:first-child\s+\.dashboard-stat-icon::before\s*\{[^}]*background:\s*currentColor/s);
});
