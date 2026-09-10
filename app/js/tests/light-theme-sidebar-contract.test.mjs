import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const tokensUrl = new URL('../../css/design-tokens.css', import.meta.url);
const shellUrl = new URL('../../css/app-shell.css', import.meta.url);
const tokens = () => fs.readFileSync(tokensUrl, 'utf8');
const shell = () => fs.readFileSync(shellUrl, 'utf8');

test('light theme uses Narvik canvas with Sorrell Brown branding', () => {
  const css = tokens();
  assert.match(css, /--narvik:\s*#EAE7DD/i);
  assert.match(css, /--sorrell-brown:\s*#99775C/i);
  assert.match(css, /:root\[data-theme=["']light["']\][\s\S]*--bg-app:\s*var\(--narvik\)/i);
  assert.match(css, /:root\[data-theme=["']light["']\][\s\S]*--brand-primary:\s*var\(--sorrell-brown\)/i);
  assert.match(css, /--text-on-brand:\s*var\(--narvik\)/i);
});

test('selected sidebar item uses a light on-brand foreground', () => {
  const css = shell();
  assert.match(css, /\.app-sidebar\s+\.app-sidebar-nav\.view-tabs\s+\.view-tab\.active\s*\{[^}]*color:\s*var\(--text-on-brand\)/s);
});

test('sidebar account controls are theme-aware instead of inheriting white legacy styles', () => {
  const css = shell();
  assert.match(css, /\.app-sidebar-footer\s+\.btn-account\s*\{[^}]*color:\s*var\(--text-primary\)/s);
  assert.match(css, /\.app-sidebar-footer\s+\.btn-account\s*\{[^}]*background:\s*var\(--bg-soft\)/s);
  assert.match(css, /\.app-sidebar-footer\s+\.btn-account\s*\{[^}]*border:\s*1px solid var\(--border-subtle\)/s);
});
