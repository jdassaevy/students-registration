import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const tokens = fs.readFileSync(new URL('../../css/design-tokens.css', import.meta.url), 'utf8');
const shell = fs.readFileSync(new URL('../../css/app-shell.css', import.meta.url), 'utf8');
const dashboard = fs.readFileSync(new URL('../features/dashboard.js', import.meta.url), 'utf8');

test('theme exposes Narvik and Sorrell Brown as the primary palette', () => {
  assert.match(tokens, /--narvik:\s*#EAE7DD/i);
  assert.match(tokens, /--sorrell-brown:\s*#99775C/i);
  assert.match(tokens, /--brand-primary:\s*var\(--sorrell-brown\)/);
  assert.match(tokens, /--text-on-brand:\s*var\(--narvik\)/);
});

test('desktop sidebar hover never repositions icon or label', () => {
  assert.match(shell, /\.app-sidebar[\s\S]*\.view-tab:hover\s+\.view-tab-icon\s*\{[^}]*transform:\s*none/s);
  assert.match(shell, /\.app-sidebar[\s\S]*\.view-tab:hover\s+\.view-tab-label\s*\{[^}]*transform:\s*none/s);
});

test('dashboard students icon is monochrome svg instead of emoji', () => {
  assert.doesNotMatch(dashboard, /👥/u);
  assert.match(dashboard, /dashboard-stat-icon[^>]*><svg[\s\S]*?<\/svg>/);
  assert.match(dashboard, /\.dashboard-stat-icon svg\{[^}]*fill:currentColor/s);
});
