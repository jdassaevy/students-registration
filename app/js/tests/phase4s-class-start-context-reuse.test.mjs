import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const read = path => fs.readFileSync(new URL(path, import.meta.url), 'utf8');
const core = read('../core/script.js');
const dueDates = read('../features/due-dates.js');
const config = read('../core/supabase-config.js');

test('core preserves class start dates and publishes the loaded class context', () => {
  assert.match(core, /startDate:\s*row\.start_date\s*\|\|\s*['"]{2}/);
  assert.match(core, /globalThis\.ClassStartContext\s*=\s*\{/);
  assert.match(core, /userId:\s*currentUser\?\.id\s*\|\|\s*null/);
  assert.match(core, /items:\s*classes\.map/);
  assert.match(core, /document\.dispatchEvent\(new CustomEvent\(['"]classes:loaded['"]/);
});

test('due dates reuses the core class context instead of rereading classes', () => {
  assert.doesNotMatch(dueDates, /\.from\(['"]classes['"]\)/);
  assert.match(dueDates, /function hydrateClassStarts\(userId\)/);
  assert.match(dueDates, /root\.ClassStartContext/);
  assert.match(dueDates, /context\?\.userId !== userId/);
  assert.match(dueDates, /document\.addEventListener\(['"]classes:loaded['"]/);
});

test('class start context is tenant-safe across logout and user changes', () => {
  assert.match(core, /globalThis\.ClassStartContext = null/);
  assert.match(
    dueDates,
    /classStartsLoadedUserId && classStartsLoadedUserId !== session\.user\.id[\s\S]*starts\.clear\(\)/
  );
  assert.match(
    dueDates,
    /if \(!session\?\.user\)[\s\S]*classStartsLoadedUserId = null[\s\S]*starts\.clear\(\)/
  );
});

test('due dates cache key is bumped after removing its bootstrap read', () => {
  assert.match(config, /features\/due-dates\.js\?v=3/);
});
