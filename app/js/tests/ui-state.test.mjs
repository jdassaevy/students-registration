import test from 'node:test';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';

const require = createRequire(import.meta.url);
const {normalizeProgress} = require('../features/ui-state.js');

test('progress values are clamped to the 0-100 range', () => {
  assert.equal(normalizeProgress(-10), 0);
  assert.equal(normalizeProgress(0), 0);
  assert.equal(normalizeProgress(35.5), 35.5);
  assert.equal(normalizeProgress(100), 100);
  assert.equal(normalizeProgress(140), 100);
  assert.equal(normalizeProgress('invalid'), 0);
});
