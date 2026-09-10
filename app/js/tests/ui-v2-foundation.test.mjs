import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const read = path => fs.readFileSync(new URL(path, import.meta.url), 'utf8');
const index = read('../../index.html');
const tokens = read('../../css/ui-v2/tokens.css');
const motion = read('../../css/ui-v2/motion.css');

test('UI v2 exposes approved palettes and semantic tokens', () => {
  for (const value of ['#000000', '#464646', '#A35E47', '#9C9A9A', '#F5F5DC', '#6F4E37', '#D47E30', '#6D3B07']) {
    assert.match(tokens, new RegExp(value, 'i'));
  }
  for (const token of [
    '--surface-page', '--surface-sidebar', '--surface-card', '--surface-elevated', '--surface-input',
    '--text-primary', '--text-secondary', '--text-muted', '--text-on-accent',
    '--accent-primary', '--accent-hover', '--accent-soft', '--border-default', '--border-strong',
    '--status-success', '--status-warning', '--status-danger'
  ]) assert.ok(tokens.includes(token), `missing ${token}`);
});

test('UI v2 styles are loaded, and when legacy is present UI v2 loads after it', () => {
  const v2 = index.indexOf('./css/ui-v2/tokens.css');
  const legacy = index.indexOf('./css/style.css');
  assert.ok(v2 >= 0);
  assert.ok(legacy === -1 || v2 > legacy);
});

test('motion layer provides quiet entry and reduced-motion support', () => {
  assert.match(motion, /prefers-reduced-motion:\s*reduce/);
  assert.match(motion, /translateY/);
  assert.match(motion, /opacity/);
});
