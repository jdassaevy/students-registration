import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const authCssUrl = new URL('../../css/auth-surface.css', import.meta.url);
const indexUrl = new URL('../../index.html', import.meta.url);
const index = () => fs.readFileSync(indexUrl, 'utf8');
const authCss = () => {
  assert.ok(fs.existsSync(authCssUrl), 'auth-surface.css must exist');
  return fs.readFileSync(authCssUrl, 'utf8');
};

test('auth fields remain editable in markup', () => {
  const html = index();
  for (const id of ['authEmail', 'authPassword']) {
    const match = html.match(new RegExp(`<input[^>]*id=["']${id}["'][^>]*>`, 'i'));
    assert.ok(match, `missing #${id}`);
    assert.doesNotMatch(match[0], /\b(?:disabled|readonly)\b/i, `${id} must stay editable`);
  }
});

test('auth inputs use theme-aware foreground and background colors', () => {
  const css = authCss();
  assert.match(css, /\.auth-view\s+\.field\s+input[^\{]*\{[^}]*background:\s*var\(--bg-soft\)/s);
  assert.match(css, /\.auth-view\s+\.field\s+input[^\{]*\{[^}]*color:\s*var\(--text-primary\)/s);
  assert.match(css, /\.auth-view\s+\.field\s+input[^\{]*\{[^}]*caret-color:\s*var\(--brand-secondary\)/s);
});

test('auth surface uses neutral theme surfaces instead of a full brand gradient', () => {
  const css = authCss();
  assert.match(css, /\.auth-view\s*\{[^}]*var\(--bg-app\)/s);
  assert.match(css, /\.auth-card\s*\{[^}]*var\(--bg-elevated\)/s);
});

test('auth surface stylesheet loads after the legacy style layer', () => {
  const html = index();
  const legacy = html.indexOf('./css/style.css');
  const auth = html.indexOf('./css/auth-surface.css');
  assert.ok(legacy >= 0, 'style.css must stay loaded');
  assert.ok(auth > legacy, 'auth-surface.css must load after style.css');
});
