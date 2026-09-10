import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const tokensUrl = new URL('../../css/ui-v2/tokens.css', import.meta.url);
const layoutUrl = new URL('../../css/ui-v2/layout.css', import.meta.url);
const tokens = () => fs.readFileSync(tokensUrl, 'utf8');
const layout = () => fs.readFileSync(layoutUrl, 'utf8');

test('light theme uses Spiced Mocha semantic palette', () => {
  const css = tokens();
  assert.match(css, /:root\[data-theme=["']light["']\][\s\S]*--surface-page:\s*#F5F5DC/i);
  assert.match(css, /:root\[data-theme=["']light["']\][\s\S]*--surface-sidebar:\s*#eadfca/i);
  assert.match(css, /:root\[data-theme=["']light["']\][\s\S]*--accent-primary:\s*#D47E30/i);
  assert.match(css, /:root\[data-theme=["']light["']\][\s\S]*--text-primary:\s*#6D3B07/i);
});

test('selected sidebar item uses semantic on-accent foreground', () => {
  const css = layout();
  assert.match(css, /\.app-sidebar \.app-sidebar-nav\.view-tabs \.view-tab\.active\s*\{[^}]*color:\s*var\(--text-on-accent\)/s);
});

test('sidebar account controls are theme-aware UI v2 surfaces', () => {
  const css = layout();
  assert.match(css, /\.app-sidebar-footer \.btn-account\s*\{[^}]*color:\s*var\(--text-secondary\)/s);
  assert.match(css, /\.app-sidebar-footer \.btn-account\s*\{[^}]*background:\s*var\(--surface-card\)/s);
  assert.match(css, /\.app-sidebar-footer \.btn-account\s*\{[^}]*border:\s*1px solid var\(--border-default\)/s);
});
