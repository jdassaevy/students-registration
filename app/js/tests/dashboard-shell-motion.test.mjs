import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const tabUrl = new URL('../features/tab-bar.js', import.meta.url);
const shellCssUrl = new URL('../../css/app-shell.css', import.meta.url);
const tabSource = () => fs.readFileSync(tabUrl, 'utf8');
const shellCss = () => fs.readFileSync(shellCssUrl, 'utf8');

test('navigation animation remains presentation-only', () => {
  const source = tabSource();
  assert.match(source, /MutationObserver/);
  assert.match(source, /ResizeObserver/);
  assert.doesNotMatch(source, /supabase/i);
  assert.doesNotMatch(source, /\.from\s*\(/);
});

test('navigation publishes responsive orientation without replacing view state', () => {
  const source = tabSource();
  assert.match(source, /matchMedia\(['"]\(max-width:\s*768px\)['"]\)/);
  assert.match(source, /nav\.dataset\.navOrientation/);
  assert.doesNotMatch(source, /setView\s*=\s*function/);
});

test('shell supports desktop vertical and mobile horizontal navigation', () => {
  const css = shellCss();
  assert.match(css, /flex-direction:\s*column/);
  assert.match(css, /@media\s*\(max-width:\s*768px\)/);
  assert.match(css, /flex-direction:\s*row/);
});
