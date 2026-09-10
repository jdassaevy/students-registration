import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const scriptUrl = new URL('../core/script.js', import.meta.url);
const script = () => fs.readFileSync(scriptUrl, 'utf8');

test('auth state callback does not await Supabase data loading inside onAuthStateChange', () => {
  const source = script();
  const listenerStart = source.indexOf('.onAuthStateChange(');
  assert.ok(listenerStart >= 0, 'onAuthStateChange listener must exist');

  const tail = source.slice(listenerStart);
  const listenerEnd = tail.indexOf('\n    });');
  assert.ok(listenerEnd >= 0, 'onAuthStateChange listener must close');

  const listener = tail.slice(0, listenerEnd);
  assert.doesNotMatch(listener, /onAuthStateChange\(async\s*\(/, 'auth callback must stay synchronous');
  assert.doesNotMatch(listener, /await\s+loadData\s*\(/, 'Supabase-backed loadData must not be awaited inside auth callback');
  assert.match(listener, /setTimeout\s*\(/, 'data loading should be deferred until after auth callback releases its lock');
});
