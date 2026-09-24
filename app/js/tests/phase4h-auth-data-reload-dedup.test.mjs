import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const read = path => fs.readFileSync(new URL(path, import.meta.url), 'utf8');
const script = read('../core/script.js');
const index = read('../../index.html');

test('auth data reload dedup no longer depends on a time window', () => {
  assert.doesNotMatch(script, /AUTH_DATA_RELOAD_DEDUP_MS|authDataLoadedAt/);
  assert.match(script, /let authDataLoadedUserId = null/);
  assert.match(script, /let authDataLoadPromise = null/);
  assert.match(script, /let authDataLoadUserId = null/);
  assert.match(script, /async function ensureAuthDataLoaded\(userId\)/);
  assert.match(script, /if \(authDataLoadedUserId === userId\)[\s\S]*return false/);
});

test('concurrent auth events for the same user still share one load', () => {
  const start = script.indexOf('async function ensureAuthDataLoaded(userId)');
  const end = script.indexOf('\nfunction updatePerson2Fields()', start);
  assert.ok(start >= 0 && end > start);
  const block = script.slice(start, end);

  assert.match(
    block,
    /authDataLoadPromise && authDataLoadUserId === userId[\s\S]*await authDataLoadPromise[\s\S]*return false/
  );
  assert.match(block, /const request = loadData\(\)/);
  assert.match(block, /await request/);
  assert.match(block, /authDataLoadedUserId = userId/);
  assert.match(block, /finally[\s\S]*authDataLoadPromise = null[\s\S]*authDataLoadUserId = null/);
});

test('logout still resets the loaded-user state', () => {
  const authStart = script.indexOf('.onAuthStateChange(async (event, session) => {');
  assert.ok(authStart >= 0);
  const authBlock = script.slice(authStart);

  assert.match(
    authBlock,
    /if \(!currentUser\) \{[\s\S]*authDataLoadedUserId = null/
  );
  assert.match(authBlock, /await ensureAuthDataLoaded\(currentUser\.id\)/);
});

test('a failed data load is not marked as successfully loaded', () => {
  const start = script.indexOf('async function ensureAuthDataLoaded(userId)');
  const end = script.indexOf('\nfunction updatePerson2Fields()', start);
  const block = script.slice(start, end);
  const awaitIndex = block.indexOf('await request');
  const markIndex = block.indexOf('authDataLoadedUserId = userId');

  assert.ok(awaitIndex >= 0);
  assert.ok(markIndex > awaitIndex, 'successful marker must only be written after loadData resolves');
});

test('core cache key is bumped without changing the password login contract', () => {
  assert.match(index, /\.\/js\/core\/script\.js\?v=11/);
  assert.match(script, /\.signInWithPassword\(\{email, password\}\)/);
});
