import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const read = path => fs.readFileSync(new URL(path, import.meta.url), 'utf8');
const core = read('../core/script.js');
const automation = read('../features/payment-automation.js');

test('successful direct payment toggles emit explicit lifecycle events', () => {
  assert.match(
    core,
    /async function toggleEntry[\s\S]*?c\.entryPayments = entryPayments;[\s\S]*?dispatchEvent\(new CustomEvent\(['"]payment:changed['"]/
  );
  assert.match(
    core,
    /async function toggleMonth[\s\S]*?c\.payments = payments;[\s\S]*?dispatchEvent\(new CustomEvent\(['"]payment:changed['"]/
  );
  assert.match(core, /kind:\s*['"]entry['"]/);
  assert.match(core, /kind:\s*['"]monthly['"]/);
  assert.match(core, /installment:\s*index \+ 1/);
});

test('payment automation consumes explicit payment change events instead of monkey-patching core functions', () => {
  assert.match(
    automation,
    /window\.addEventListener\(['"]payment:changed['"][\s\S]*?processLifecycle\(detail\)/
  );
  assert.doesNotMatch(automation, /const previousToggleEntry = toggleEntry/);
  assert.doesNotMatch(automation, /const previousToggleMonth = toggleMonth/);
  assert.doesNotMatch(automation, /toggleEntry = async function/);
  assert.doesNotMatch(automation, /toggleMonth = async function/);
});

test('payment automation runtime still exposes processLifecycle for form-save reconciliation', () => {
  assert.match(
    automation,
    /window\.PaymentAutomation = \{[\s\S]*?processLifecycle,[\s\S]*?processSavedStudent/
  );
});
