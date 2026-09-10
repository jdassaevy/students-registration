import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const read = path => fs.readFileSync(new URL(path, import.meta.url), 'utf8');
const css = read('../../css/ui-v2/components.css');

test('student payment blocks use semantic dark-friendly surfaces', () => {
  assert.match(css, /#appView\s+\.financial-person-block\s*\{[^}]*background:\s*var\(--surface-card\)/s);
  assert.match(css, /#appView\s+\.financial-person-block\s+h3\s*\{[^}]*color:\s*var\(--text-primary\)/s);
  assert.match(css, /#appView\s+\.financial-person-block\s+\.check\s*\{[^}]*background:\s*var\(--surface-elevated\)/s);
});

test('form controls and compact payment actions suppress legacy white inset glare', () => {
  assert.match(css, /#appView\s+\.financial-person-block\s+input[\s\S]*?#appView\s+\.month[\s\S]*?box-shadow:\s*none/s);
  assert.match(css, /#appView\s+\.custom-select-trigger\s*\{[^}]*box-shadow:\s*none/s);
  assert.match(css, /#appView\s+\.btn-light\s*\{[^}]*box-shadow:\s*none/s);
});

test('custom select reveals downward with a quiet transition', () => {
  assert.match(css, /#appView\s+\.custom-select-menu\s*\{[^}]*clip-path:\s*inset\([^}]*100%[^}]*\)[^}]*transition:[^}]*clip-path[^}]*2(?:6|7|8)0ms/s);
  assert.match(css, /#appView\s+\.custom-select\.is-open\s+\.custom-select-menu\s*\{[^}]*clip-path:\s*inset\(0\)/s);
});

test('custom select polish respects reduced motion', () => {
  assert.match(css, /@media\s*\(prefers-reduced-motion:\s*reduce\)[\s\S]*\.custom-select-menu[\s\S]*transition-duration:\s*\.01ms\s*!important/s);
});
