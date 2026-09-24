import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const read = path => fs.readFileSync(new URL(path, import.meta.url), 'utf8');
const dueDates = read('../features/due-dates.js');
const automation = read('../features/automation-center.js');
const config = read('../core/supabase-config.js');
const tabBar = read('../features/tab-bar.js');

test('due dates coalesces initial class-start reads per authenticated user', () => {
  assert.match(dueDates, /let classStartsLoadedUserId = null/);
  assert.match(dueDates, /let classStartsLoadPromise = null/);
  assert.match(dueDates, /let classStartsLoadUserId = null/);
  assert.match(dueDates, /async function ensureClassStartsLoaded\(userId\)/);
  assert.match(
    dueDates,
    /if \(classStartsLoadedUserId === userId\)[\s\S]*return false/
  );
  assert.match(
    dueDates,
    /classStartsLoadPromise && classStartsLoadUserId === userId[\s\S]*await classStartsLoadPromise[\s\S]*return false/
  );
});

test('due dates only reacts to initial/sign-in Auth events and resets on logout', () => {
  const authStart = dueDates.indexOf('.onAuthStateChange((event, session) => {');
  assert.ok(authStart >= 0);
  const authBlock = dueDates.slice(authStart);

  assert.match(
    authBlock,
    /if \(!session\?\.user\) \{[\s\S]*classStartsLoadedUserId = null[\s\S]*starts\.clear\(\)/
  );
  assert.match(
    authBlock,
    /const shouldLoad =\s*event === ['"]INITIAL_SESSION['"]\s*\|\|\s*event === ['"]SIGNED_IN['"]/
  );
  assert.match(authBlock, /if \(!shouldLoad\)[\s\S]*return/);
  assert.match(authBlock, /ensureClassStartsLoaded\(session\.user\.id\)/);
  assert.match(dueDates, /getSession\(\)[\s\S]*ensureClassStartsLoaded\(data\.session\.user\.id\)/);
});

test('due dates never marks a failed class-start read as loaded', () => {
  const start = dueDates.indexOf('async function ensureClassStartsLoaded(userId)');
  const end = dueDates.indexOf('\n    function decorateClassList()', start);
  assert.ok(start >= 0 && end > start);
  const block = dueDates.slice(start, end);
  const awaitIndex = block.indexOf('await request');
  const markIndex = block.indexOf('classStartsLoadedUserId = userId');
  assert.ok(awaitIndex >= 0);
  assert.ok(markIndex > awaitIndex);
});

test('automation ignores repeated Auth events for the same user', () => {
  const authStart = automation.indexOf('db.auth.onAuthStateChange((event, session) => {');
  assert.ok(authStart >= 0);
  const authBlock = automation.slice(authStart);

  assert.match(authBlock, /const previousUserId = activeUserId/);
  assert.match(authBlock, /const nextUserId = session\?\.user\?\.id \|\| null/);
  assert.match(authBlock, /const userChanged = previousUserId !== nextUserId/);
  assert.match(
    authBlock,
    /if \(!userChanged && event !== ['"]INITIAL_SESSION['"]\)[\s\S]*return/
  );
  assert.match(
    authBlock,
    /automationDirty = true[\s\S]*automationLastLoadedAt = 0[\s\S]*refreshAll\(\{force: true\}\)/
  );
});

test('automation payment and manual refresh still force a refresh', () => {
  assert.match(automation, /automationRefresh[^
]*addEventListener\(['"]click['"][\s\S]*force: true/);
  assert.match(automation, /payment:lifecycle[\s\S]*automationDirty = true[\s\S]*force: true/);
});

test('updated feature cache keys are consistent across loaders', () => {
  assert.match(config, /features\/due-dates\.js\?v=2/);
  assert.match(config, /features\/automation-center\.js\?v=7/);
  assert.match(tabBar, /features\/automation-center\.js\?v=7/);
});
