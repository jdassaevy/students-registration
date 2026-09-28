import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const read = path => fs.readFileSync(new URL(path, import.meta.url), 'utf8');
const receipts = read('../features/receipts.js');
const config = read('../core/supabase-config.js');

test('receipt history does not read from Supabase during module boot', () => {
  const bootStart = receipts.indexOf("if (document.readyState === 'loading')");
  assert.ok(bootStart >= 0);
  const bootBlock = receipts.slice(bootStart);
  assert.doesNotMatch(bootBlock, /api\.load\(\)/);
  assert.match(bootBlock, /ensureHistoryPanel\(\)/);
});

test('receipt history lazy-loads on the first financial view', () => {
  assert.match(receipts, /let receiptHistoryLoaded = false/);
  assert.match(receipts, /const originalSetView = typeof setView === ['"]function['"]/);
  assert.match(
    receipts,
    /view === ['"]financial['"][\s\S]*!receiptHistoryLoaded[\s\S]*api\.load\(\)/
  );
});

test('receipt reads are request-deduplicated without turning api.load into a stale cache', () => {
  assert.match(receipts, /let receiptLoadPromise = null/);
  assert.match(receipts, /if \(receiptLoadPromise\)[\s\S]*return receiptLoadPromise/);
  assert.match(receipts, /receiptLoadPromise = \(async \(\) =>/);
  assert.match(receipts, /receiptHistoryLoaded = true/);
  assert.match(receipts, /finally[\s\S]*receiptLoadPromise = null/);
});

test('payment automation invalidates receipt history without forcing an offscreen refresh', () => {
  const paymentAutomation = read('../features/payment-automation.js');
  assert.match(paymentAutomation, /window\.Receipts\?\.invalidate[\s\S]*window\.Receipts\.invalidate\(\)/);
  assert.doesNotMatch(paymentAutomation, /window\.Receipts\?\.load[\s\S]*window\.Receipts\.load\(\)/);
});

test('receipts cache key is bumped for the lazy-load behavior', () => {
  assert.match(config, /features\/receipts\.js\?v=3/);
});
