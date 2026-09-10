import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const authCssUrl = new URL('../../css/ui-v2/pages/auth.css', import.meta.url);
const indexUrl = new URL('../../index.html', import.meta.url);
const index = () => fs.readFileSync(indexUrl, 'utf8');
const authCss = () => fs.readFileSync(authCssUrl, 'utf8');

test('auth fields remain editable in markup', () => {
  const html = index();
  for (const id of ['authEmail', 'authPassword']) {
    const match = html.match(new RegExp(`<input[^>]*id=["']${id}["'][^>]*>`, 'i'));
    assert.ok(match, `missing #${id}`);
    assert.doesNotMatch(match[0], /\b(?:disabled|readonly)\b/i, `${id} must stay editable`);
  }
});

test('auth inputs use UI v2 theme-aware foreground and background colors', () => {
  const css = authCss();
  assert.match(css, /\.auth-view\s+\.field\s+input[^\{]*\{[^}]*background:\s*var\(--surface-input\)/s);
  assert.match(css, /\.auth-view\s+\.field\s+input[^\{]*\{[^}]*color:\s*var\(--text-primary\)/s);
  assert.match(css, /\.auth-view\s+\.field\s+input[^\{]*\{[^}]*caret-color:\s*var\(--accent-primary\)/s);
});

test('auth surface uses neutral semantic UI v2 surfaces', () => {
  const css = authCss();
  assert.match(css, /\.auth-view\s*\{[^}]*background:\s*var\(--surface-page\)/s);
  assert.match(css, /\.auth-card\s*\{[^}]*background:\s*var\(--surface-card\)/s);
});

test('auth UI v2 stylesheet loads after shared UI v2 layout', () => {
  const html = index();
  const layout = html.indexOf('./css/ui-v2/layout.css');
  const auth = html.indexOf('./css/ui-v2/pages/auth.css');
  assert.ok(layout >= 0, 'UI v2 layout must stay loaded');
  assert.ok(auth > layout, 'auth UI v2 must load after shared layout');
});
