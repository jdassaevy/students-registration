import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const styleUrl = new URL('../../css/style.css', import.meta.url);
const indexUrl = new URL('../../index.html', import.meta.url);
const style = () => fs.readFileSync(styleUrl, 'utf8');
const index = () => fs.readFileSync(indexUrl, 'utf8');

test('auth fields remain editable in markup', () => {
  const html = index();
  for (const id of ['authEmail', 'authPassword']) {
    const match = html.match(new RegExp(`<input[^>]*id=["']${id}["'][^>]*>`, 'i'));
    assert.ok(match, `missing #${id}`);
    assert.doesNotMatch(match[0], /\b(?:disabled|readonly)\b/i, `${id} must stay editable`);
  }
});

test('auth inputs use theme-aware foreground and background colors', () => {
  const css = style();
  assert.match(css, /\.auth-view\s+\.field\s+input[^\{]*\{[^}]*background:\s*var\(--bg-soft\)/s);
  assert.match(css, /\.auth-view\s+\.field\s+input[^\{]*\{[^}]*color:\s*var\(--text-primary\)/s);
  assert.match(css, /\.auth-view\s+\.field\s+input[^\{]*\{[^}]*caret-color:\s*var\(--brand-secondary\)/s);
});

test('auth surface uses neutral theme surfaces instead of a full brand gradient', () => {
  const css = style();
  assert.match(css, /\.auth-view\s*\{[^}]*var\(--bg-app\)/s);
  assert.match(css, /\.auth-card\s*\{[^}]*var\(--bg-elevated\)/s);
});
