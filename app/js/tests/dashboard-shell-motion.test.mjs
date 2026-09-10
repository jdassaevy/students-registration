import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const tabUrl = new URL('../features/tab-bar.js', import.meta.url);
const layoutUrl = new URL('../../css/ui-v2/layout.css', import.meta.url);
const componentsUrl = new URL('../../css/ui-v2/components.css', import.meta.url);
const motionUrl = new URL('../../css/ui-v2/motion.css', import.meta.url);
const tabSource = () => fs.readFileSync(tabUrl, 'utf8');
const layoutCss = () => fs.readFileSync(layoutUrl, 'utf8');
const asyncCss = () => `${fs.readFileSync(componentsUrl, 'utf8')}\n${fs.readFileSync(motionUrl, 'utf8')}`;

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

test('UI v2 shell supports desktop vertical and mobile horizontal navigation', () => {
  const css = layoutCss();
  assert.match(css, /\.app-sidebar[\s\S]*flex-direction:\s*column/s);
  assert.match(css, /@media\s*\(max-width:\s*768px\)/);
  assert.match(css, /\.app-sidebar[\s\S]*\.app-sidebar-nav\.view-tabs[\s\S]*flex-direction:\s*row/s);
});

test('UI v2 async states define skeleton and reduced-motion behavior', () => {
  const css = asyncCss();
  assert.match(css, /\.ui-skeleton\s*\{/);
  assert.match(css, /@keyframes\s+ui-skeleton-shimmer/);
  assert.match(css, /\.is-loading\s*\{/);
  assert.match(css, /@media\s*\(prefers-reduced-motion:\s*reduce\)/);
  assert.doesNotMatch(css, /transition[^;]*(?:margin|padding|top|left)/i);
});
