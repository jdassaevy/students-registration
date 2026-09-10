import test from 'node:test';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';

const require = createRequire(import.meta.url);
const {normalizeTheme, resolveInitialTheme} = require('../features/theme-controller.js');

test('normalizes supported themes only', () => {
  assert.equal(normalizeTheme('dark'), 'dark');
  assert.equal(normalizeTheme('light'), 'light');
  assert.equal(normalizeTheme('anything'), null);
});

test('stored theme wins when valid', () => {
  assert.equal(resolveInitialTheme('light'), 'light');
  assert.equal(resolveInitialTheme('dark'), 'dark');
});

test('dark is the product default when no stored theme exists', () => {
  assert.equal(resolveInitialTheme(null), 'dark');
});
