import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

function read(relative) {
  return fs.readFileSync(new URL(`../${relative}`, import.meta.url), 'utf8');
}

const receipts = read('features/receipts.js');
const paymentAutomation = read('features/payment-automation.js');

test('receipt history tracks dirty state separately from loaded state', () => {
  assert.match(receipts, /let receiptHistoryLoaded = false/);
  assert.match(receipts, /let receiptHistoryDirty = false/);
  assert.match(receipts, /receiptHistoryDirty = false/);
});

test('payment lifecycle invalidates receipt history instead of always forcing a read', () => {
  assert.match(
    paymentAutomation,
    /window\.Receipts\?\.invalidate[\s\S]*await window\.Receipts\.invalidate\(\)/
  );
  assert.doesNotMatch(
    paymentAutomation,
    /window\.Receipts\?\.load[\s\S]*await window\.Receipts\.load\(\)/
  );
});

test('receipt invalidation refreshes immediately only while financial view is active', () => {
  assert.match(
    receipts,
    /async invalidate\(\)[\s\S]*receiptHistoryDirty = true[\s\S]*activeView === ['"]financial['"][\s\S]*return api\.load\(\)/
  );
});

test('entering financial view reloads when history is missing or dirty', () => {
  assert.match(
    receipts,
    /view === ['"]financial['"][\s\S]*\(!receiptHistoryLoaded \|\| receiptHistoryDirty\)[\s\S]*api\.load\(\)/
  );
});

test('initial financial view also reloads when history is missing or dirty', () => {
  assert.match(
    receipts,
    /activeView === ['"]financial['"][\s\S]*\(!receiptHistoryLoaded \|\| receiptHistoryDirty\)[\s\S]*api\.load\(\)/
  );
});
