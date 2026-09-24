import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

const read = path => fs.readFileSync(new URL(path, import.meta.url), 'utf8');
const exists = path => fs.existsSync(new URL(path, import.meta.url));

test('secondary read resilience helper exists, parses and stays bounded', () => {
  assert.equal(exists('../core/read-resilience.js'), true);
  const helper = read('../core/read-resilience.js');
  assert.doesNotThrow(() => new vm.Script(helper));
  assert.match(helper, /DEFAULT_TIMEOUT_MS = 8000/);
  assert.match(helper, /DEFAULT_RETRIES = 1/);
  assert.match(helper, /status === 408/);
  assert.match(helper, /status === 429/);
  assert.match(helper, /status >= 500/);
  assert.match(helper, /navigator\?\.onLine === false/);
});

test('helper loads after auth core and before secondary feature modules', () => {
  const index = read('../../index.html');
  const coreIndex = index.indexOf('./js/core/script.js?v=9');
  const resilience = index.indexOf('./js/core/read-resilience.js?v=2');
  const profile = index.indexOf('./js/features/academy-profile.js?v=3');
  assert.ok(coreIndex >= 0);
  assert.ok(resilience > coreIndex);
  assert.ok(profile > resilience);
});

test('critical auth and initial data-loading path remains untouched', () => {
  const core = read('../core/script.js');
  assert.doesNotMatch(core, /ReadResilience|resilientRead|loadDataPromise/);
  assert.doesNotMatch(core, /addEventListener\(['"](?:online|offline)['"]/);
});

test('reports retry only the payment history read', () => {
  const reports = read('../features/reports.js');
  assert.match(reports, /const read = \(\) => db[\s\S]*\.from\(['"]payment_events['"]\)/);
  assert.match(reports, /ReadResilience\?\.run[\s\S]*ReadResilience\.run\(read\)/);
  assert.equal((reports.match(/\.from\(['"]payment_events['"]\)/g) || []).length, 1);
});

test('automation retries reads but never wraps settings writes or message retry invoke', () => {
  const automation = read('../features/automation-center.js');
  assert.match(automation, /const read = factory => globalThis\.ReadResilience\?\.run/);
  assert.match(automation, /read\(\(\) => db[\s\S]*\.from\(['"]automation_messages['"]\)/);
  assert.match(automation, /read\(\(\) => db[\s\S]*\.from\(['"]students['"]\)/);
  assert.match(automation, /read\(\(\) => db[\s\S]*\.rpc\(['"]find_duplicate_active_receipts['"]\)/);
  assert.doesNotMatch(automation, /read\(\(\) => db[\s\S]{0,220}\.(?:insert|update|delete)\s*\(/);
  assert.doesNotMatch(automation, /read\(\(\) => db[\s\S]{0,220}functions\.invoke\s*\(/);
  assert.match(automation, /\.from\(['"]automation_settings['"]\)\.insert\(/);
  assert.match(automation, /\.from\(['"]automation_settings['"]\)\.update\(/);
  assert.match(automation, /db\.functions\.invoke\(['"]retry-automation-message['"]/);
});

test('automation preserves last rendered state when a refresh fails', () => {
  const automation = read('../features/automation-center.js');
  assert.match(
    automation,
    /if \(automationReady\) \{[\s\S]*renderSettings\(\)[\s\S]*renderSummary\(\)[\s\S]*renderActivity\(\)[\s\S]*Mantendo os últimos dados carregados/
  );
});

test('receipts keep the previous list when a refresh read fails', () => {
  const receipts = read('../features/receipts.js');
  const errorBlock = receipts.slice(receipts.indexOf('if (error) {'), receipts.indexOf('api.items = data || []'));
  assert.match(receipts, /ReadResilience\.run\(read\)/);
  assert.doesNotMatch(errorBlock, /api\.items\s*=\s*\[\]/);
  assert.match(errorBlock, /return api\.items/);
});

test('academy profile retries only load while save stays a direct update', () => {
  const profile = read('../features/academy-profile.js');
  const loadBlock = profile.slice(profile.indexOf('async function load()'), profile.indexOf('async function save('));
  const saveBlock = profile.slice(profile.indexOf('async function save('), profile.indexOf('function byId('));
  assert.match(loadBlock, /ReadResilience\.run\(read\)/);
  assert.doesNotMatch(saveBlock, /ReadResilience|resilientRead/);
  assert.match(saveBlock, /\.update\(payload\)/);
});
