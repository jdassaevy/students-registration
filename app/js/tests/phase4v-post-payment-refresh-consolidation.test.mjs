import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const read = path => fs.readFileSync(new URL(path, import.meta.url), 'utf8');
const automation = read('../features/automation-center.js');
const receipts = read('../features/receipts.js');
const config = read('../core/supabase-config.js');
const tabBar = read('../features/tab-bar.js');
const index = read('../../index.html');

test('automation settings use a bounded projection and are cached per user', () => {
  assert.match(automation, /let settingsLoadedUserId = null/);
  assert.match(automation, /async function ensureSettings\(\{force = false\} = \{\}\)/);
  assert.match(
    automation,
    /!force && settingsLoadedUserId === userId[\s\S]*return currentSettings/
  );
  assert.match(
    automation,
    /const fields = ['"]reminders_enabled,payment_confirmation_enabled,receipt_delivery_enabled,void_notification_enabled['"][\s\S]*\.select\(fields\)/
  );
});

test('automation readiness has its own cache and renders dynamic checks without rereading', () => {
  assert.match(automation, /const AUTOMATION_READINESS_CACHE_MS = 300_000/);
  assert.match(automation, /let readinessCache = null/);
  assert.match(automation, /function renderReadiness\(settingsReady = false\)/);
  assert.match(
    automation,
    /async function loadReadiness\(settingsReady = false, \{force = false, render = true\} = \{\}\)/
  );
  assert.match(
    automation,
    /Date\.now\(\) - readinessCache\.loadedAt < AUTOMATION_READINESS_CACHE_MS/
  );
});

test('payment lifecycle refreshes only automation activity instead of the full readiness stack', () => {
  assert.match(automation, /async function refreshActivity\(\{force = false\} = \{\}\)/);
  assert.match(
    automation,
    /window\.addEventListener\(['"]payment:lifecycle['"][\s\S]*?refreshActivity\(\{force: true\}\)/
  );
  const paymentHandlerStart = automation.indexOf("window.addEventListener('payment:lifecycle'");
  const paymentHandler = automation.slice(paymentHandlerStart, paymentHandlerStart + 600);
  assert.doesNotMatch(paymentHandler, /refreshAll\(/);
  assert.doesNotMatch(paymentHandler, /loadReadiness\(/);
  assert.doesNotMatch(paymentHandler, /ensureSettings\(/);
});

test('shared student context updates automation labels locally without dirtying the whole center', () => {
  const start = automation.indexOf("document.addEventListener('students:loaded'");
  assert.ok(start >= 0);
  const block = automation.slice(start, start + 900);
  assert.match(block, /currentStudents = sharedStudents/);
  assert.match(block, /studentsById = new Map/);
  assert.match(block, /renderActivity\(\)/);
  assert.match(block, /renderReadiness\(/);
  assert.doesNotMatch(block, /automationDirty = true/);
  assert.doesNotMatch(block, /refreshAll\(/);
});

test('receipt history uses a short cache but manual refresh and repair remain forced', () => {
  assert.match(receipts, /const RECEIPT_HISTORY_CACHE_MS = 30_000/);
  assert.match(receipts, /let receiptLastLoadedAt = 0/);
  assert.match(receipts, /async load\(\{force = false\} = \{\}\)/);
  assert.match(
    receipts,
    /!force[\s\S]*receiptHistoryLoaded[\s\S]*!receiptHistoryDirty[\s\S]*Date\.now\(\) - receiptLastLoadedAt < RECEIPT_HISTORY_CACHE_MS/
  );
  assert.match(receipts, /refreshReceiptsBtn['"]\)\s*\.onclick = \(\) => api\.load\(\{force: true\}\)/);
  assert.match(receipts, /await api\.load\(\{force: true\}\)/);
});

test('phase 4V cache keys refresh automation and receipt bundles', () => {
  assert.match(index, /\.\/js\/core\/supabase-config\.js\?v=6/);
  assert.match(index, /\.\/js\/features\/tab-bar\.js\?v=8/);
  assert.match(config, /receipts\.js\?v=5/);
  assert.match(tabBar, /automation-center\.js\?v=11/);
});
