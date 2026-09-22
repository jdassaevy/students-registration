import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

const read = path => fs.readFileSync(new URL(path, import.meta.url), 'utf8');
const helper = read('../core/read-resilience.js');
const core = read('../core/script.js');
const reports = read('../features/reports.js');
const automation = read('../features/automation-center.js');
const receipts = read('../features/receipts.js');
const profile = read('../features/academy-profile.js');
const paymentAutomation = read('../features/payment-automation.js');
const index = read('../../index.html');

test('read resilience helper is parseable and bounded', () => {
  assert.doesNotThrow(() => new vm.Script(helper));
  assert.match(helper, /DEFAULT_TIMEOUT_MS = 8000/);
  assert.match(helper, /DEFAULT_RETRIES = 1/);
  assert.match(helper, /Promise\.race/);
  assert.match(helper, /status === 408/);
  assert.match(helper, /status === 429/);
  assert.match(helper, /status >= 500/);
  assert.match(helper, /navigator\?\.onLine === false/);
});

test('read resilience loads before core business modules', () => {
  const resilience = index.indexOf('./js/core/read-resilience.js?v=1');
  const coreIndex = index.indexOf('./js/core/script.js?v=9');
  assert.ok(resilience >= 0);
  assert.ok(coreIndex > resilience);
});

test('core data loading deduplicates reads and preserves useful state on failure', () => {
  assert.match(core, /let loadDataPromise = null/);
  assert.match(core, /if \(loadDataPromise\)[\s\S]*return loadDataPromise/);
  assert.ok((core.match(/resilientRead\(\(\) => db/g) || []).length >= 4);
  assert.match(core, /const nextClasses = \(classResult\.data \|\| \[\]\)\.map\(fromClass\)/);
  assert.match(core, /const nextCouples = \(studentResult\.data \|\| \[\]\)\.map\(fromStudent\)/);
  assert.match(core, /if \(hadData\) \{[\s\S]*render\(\)/);
  assert.match(core, /Não foi possível carregar seus dados\. Verifique a conexão/);
});

test('offline keeps stale data and reconnect performs read-only refresh without legacy migration', () => {
  assert.match(core, /addEventListener\(['"]offline['"][\s\S]*Mantendo os últimos dados carregados/);
  assert.match(core, /addEventListener\(['"]online['"][\s\S]*loadData\(\{showLoading: false, migrateLegacy: false\}\)/);
});

test('Phase 4C retry wrapper stays off write paths', () => {
  const runtime = [core, automation, profile, paymentAutomation].join('\n');
  assert.doesNotMatch(runtime, /(?:resilientRead|ReadResilience\.run)\([\s\S]{0,220}\.(?:insert|update|delete)\s*\(/);
  assert.doesNotMatch(runtime, /(?:resilientRead|ReadResilience\.run)\([\s\S]{0,220}functions\.invoke\s*\(/);
});

test('reports bound optional chart loading and retry only payment-history reads', () => {
  assert.match(reports, /setTimeout\([\s\S]*Chart\.js load timed out[\s\S]*8000/);
  assert.match(reports, /ReadResilience\?\.run[\s\S]*ReadResilience\.run\(read\)/);
  assert.equal((reports.match(/\.from\(['"]payment_events['"]\)/g) || []).length, 1);
});

test('automation retries read-only data and keeps the last rendered state after refresh failure', () => {
  assert.match(automation, /const read = factory => globalThis\.ReadResilience\?\.run/);
  assert.match(automation, /read\(\(\) => db[\s\S]*automation_messages/);
  assert.match(automation, /read\(\(\) => db[\s\S]*academy_profiles/);
  assert.match(automation, /if \(automationReady\) \{[\s\S]*renderActivity\(\)[\s\S]*Mantendo os últimos dados carregados/);
});

test('receipts preserve the previous list when a read refresh fails', () => {
  const errorBlock = receipts.slice(receipts.indexOf('if (error) {'), receipts.indexOf('api.items = data || []'));
  assert.doesNotMatch(errorBlock, /api\.items\s*=\s*\[\]/);
  assert.match(errorBlock, /return api\.items/);
});

test('academy profile retries only its read path while save remains a direct update', () => {
  const loadBlock = profile.slice(profile.indexOf('async function load()'), profile.indexOf('async function save('));
  const saveBlock = profile.slice(profile.indexOf('async function save('), profile.indexOf('function byId('));
  assert.match(loadBlock, /ReadResilience\.run\(read\)/);
  assert.doesNotMatch(saveBlock, /ReadResilience|resilientRead/);
  assert.match(saveBlock, /\.update\(payload\)/);
});
