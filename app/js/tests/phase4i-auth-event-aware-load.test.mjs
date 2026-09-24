import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const read = path => fs.readFileSync(new URL(path, import.meta.url), 'utf8');
const script = read('../core/script.js');
const index = read('../../index.html');

test('auth dataset loading is user-aware instead of time-based', () => {
  assert.doesNotMatch(script, /AUTH_DATA_RELOAD_DEDUP_MS/);
  assert.doesNotMatch(script, /authDataLoadedAt/);
  assert.match(script, /let authDataLoadedUserId = null/);
  assert.match(script, /let authDataLoadPromise = null/);
  assert.match(script, /let authDataLoadUserId = null/);
  assert.match(script, /async function ensureAuthDataLoaded\(userId\)/);

  const start = script.indexOf('async function ensureAuthDataLoaded(userId)');
  const end = script.indexOf('\nfunction updatePerson2Fields()', start);
  assert.ok(start >= 0 && end > start);
  const block = script.slice(start, end);

  assert.match(block, /if \(authDataLoadedUserId === userId\)[\s\S]*return false/);
  assert.doesNotMatch(block, /Date\.now\(|setTimeout|15_000/);
});

test('concurrent auth events for the same user still share one load', () => {
  const start = script.indexOf('async function ensureAuthDataLoaded(userId)');
  const end = script.indexOf('\nfunction updatePerson2Fields()', start);
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

test('only initial/sign-in auth events may trigger the full dataset load', () => {
  const authStart = script.indexOf('.onAuthStateChange(async (event, session) => {');
  assert.ok(authStart >= 0);
  const authBlock = script.slice(authStart);

  assert.match(
    authBlock,
    /const shouldLoadData =\s*event === ['"]INITIAL_SESSION['"]\s*\|\|\s*event === ['"]SIGNED_IN['"]/
  );
  assert.match(authBlock, /if \(!shouldLoadData\)[\s\S]*return/);
  assert.match(authBlock, /await ensureAuthDataLoaded\(currentUser\.id\)/);
});

test('logout clears the loaded-user marker and a new user can load', () => {
  const authStart = script.indexOf('.onAuthStateChange(async (event, session) => {');
  const authBlock = script.slice(authStart);

  assert.match(
    authBlock,
    /if \(!currentUser\) \{[\s\S]*authDataLoadedUserId = null/
  );
  assert.doesNotMatch(authBlock, /authDataLoadedAt/);
});

test('failed initial load is never marked as loaded', () => {
  const start = script.indexOf('async function ensureAuthDataLoaded(userId)');
  const end = script.indexOf('\nfunction updatePerson2Fields()', start);
  const block = script.slice(start, end);
  const awaitIndex = block.indexOf('await request');
  const markIndex = block.indexOf('authDataLoadedUserId = userId');

  assert.ok(awaitIndex >= 0);
  assert.ok(markIndex > awaitIndex);
});

test('core cache key advances while password login contract stays intact', () => {
  assert.match(index, /\.\/js\/core\/script\.js\?v=11/);
  assert.match(script, /\.signInWithPassword\(\{email, password\}\)/);
});
