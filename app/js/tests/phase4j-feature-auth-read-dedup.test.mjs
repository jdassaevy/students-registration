import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const read = path => fs.readFileSync(new URL(path, import.meta.url), 'utf8');
const dueDates = read('../features/due-dates.js');
const automation = read('../features/automation-center.js');
const config = read('../core/supabase-config.js');
const tabBar = read('../features/tab-bar.js');

test('due dates hydrates class starts from the shared core context', () => {
  assert.match(dueDates, /let classStartsLoadedUserId = null/);
  assert.match(dueDates, /function hydrateClassStarts\(userId\)/);
  assert.match(dueDates, /const context = root\.ClassStartContext/);
  assert.match(dueDates, /context\?\.userId !== userId[\s\S]*return false/);
  assert.match(dueDates, /classStartsLoadedUserId = userId/);
  assert.doesNotMatch(
    dueDates,
    /\.from\(['"]classes['"]\)[\s\S]{0,160}\.select\(['"]id,start_date['"]\)/
  );
});

test('due dates reacts to shared class data and resets on auth changes', () => {
  const authStart = dueDates.indexOf('.onAuthStateChange((event, session) => {');
  assert.ok(authStart >= 0);
  const authBlock = dueDates.slice(authStart);

  assert.match(
    authBlock,
    /if \(!session\?\.user\) \{[\s\S]*classStartsLoadedUserId = null[\s\S]*starts\.clear\(\)/
  );
  assert.match(
    authBlock,
    /const shouldHydrate =\s*event === ['"]INITIAL_SESSION['"]\s*\|\|\s*event === ['"]SIGNED_IN['"]/
  );
  assert.match(authBlock, /hydrateClassStarts\(session\.user\.id\)/);
  assert.match(dueDates, /document\.addEventListener\(['"]classes:loaded['"][\s\S]*hydrateClassStarts\(userId\)/);
  assert.doesNotMatch(dueDates, /\.auth\s*\.getSession\(\)/);
});

test('due dates only marks a matching user context as loaded', () => {
  const start = dueDates.indexOf('function hydrateClassStarts(userId)');
  const end = dueDates.indexOf('\n    function decorateClassList()', start);
  assert.ok(start >= 0 && end > start);
  const block = dueDates.slice(start, end);
  const guardIndex = block.indexOf('context?.userId !== userId');
  const markIndex = block.indexOf('classStartsLoadedUserId = userId');
  assert.ok(guardIndex >= 0);
  assert.ok(markIndex > guardIndex);
});

test('automation reuses its cache for repeated Auth events from the same user', () => {
  const authStart = automation.indexOf('db.auth.onAuthStateChange((event, session) => {');
  assert.ok(authStart >= 0);
  const authBlock = automation.slice(authStart);

  assert.match(authBlock, /const previousUserId = activeUserId/);
  assert.match(authBlock, /const nextUserId = session\?\.user\?\.id \|\| null/);
  assert.match(authBlock, /const userChanged = previousUserId !== nextUserId/);
  assert.match(
    authBlock,
    /if \(!userChanged\)[\s\S]*refreshAll\(\)[\s\S]*return/
  );
  assert.doesNotMatch(
    authBlock.match(/if \(!userChanged\)[\s\S]*?return/)?.[0] || '',
    /force:\s*true/
  );
  assert.match(
    authBlock,
    /automationDirty = true[\s\S]*automationLastLoadedAt = 0[\s\S]*refreshAll\(\{force: true\}\)/
  );
});

test('automation payment and manual refresh still force a refresh', () => {
  assert.match(automation, /automationRefresh[\s\S]*addEventListener\(['"]click['"][\s\S]*force: true/);
  assert.match(automation, /payment:lifecycle[\s\S]*automationDirty = true[\s\S]*force: true/);
});

test('updated feature cache keys keep automation on one lazy loader', () => {
  assert.match(config, /features\/due-dates\.js\?v=3/);
  assert.doesNotMatch(config, /features\/automation-center\.js/);
  assert.match(tabBar, /features\/automation-center\.js\?v=9/);
});
