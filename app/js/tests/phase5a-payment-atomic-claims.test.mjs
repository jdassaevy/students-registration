import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const source = fs.readFileSync(
  new URL('../../../supabase/functions/payment-lifecycle/index.ts', import.meta.url),
  'utf8'
);

function between(startMarker, endMarker) {
  const start = source.indexOf(startMarker);
  const end = source.indexOf(endMarker, start);
  assert.ok(start >= 0, `missing start marker: ${startMarker}`);
  assert.ok(end > start, `missing end marker: ${endMarker}`);
  return source.slice(start, end);
}

test('phase 5A paid path claims payment_events with insert first', () => {
  const block = between(
    'let paymentEvent: any = null;',
    'const academy = academyAccess.academy;'
  );

  const insertAt = block.indexOf('.from("payment_events").insert({');
  const fallbackAt = block.indexOf('.from("payment_events").select(PAYMENT_EVENT_RUNTIME_SELECT)');

  assert.ok(insertAt >= 0, 'payment event insert must exist');
  assert.ok(fallbackAt > insertAt, 'payment event read must only happen after the insert claim');
  assert.doesNotMatch(block, /existingEvent/);
  assert.match(block, /error && !isUniqueViolation\(error\)/);
  assert.match(block, /concurrentEvent\.academy_id !== student\.academy_id/);
});

test('phase 5A only reads an active receipt before the claim on the unpaid path', () => {
  const block = between(
    'let activeReceipt: any = null;',
    'let paymentEvent: any = null;'
  );

  assert.match(block, /if \(!paid\)/);
  assert.match(block, /from\("receipts"\)\.select\(RECEIPT_RUNTIME_SELECT\)/);
  assert.match(block, /receiptActionForState/);
});

test('phase 5A paid receipt path claims the unique active slot with insert first', () => {
  const block = between(
    'let receipt: any = activeReceipt || null;',
    'if (receipt && !receiptMatchesStudent'
  );

  const insertAt = block.indexOf('.from("receipts").insert({');
  const fallbackAt = block.indexOf('.from("receipts").select(RECEIPT_RUNTIME_SELECT)');

  assert.ok(insertAt >= 0, 'receipt insert must exist');
  assert.ok(fallbackAt > insertAt, 'active receipt read must only happen after an insert collision');
  assert.match(block, /action = "create"/);
  assert.match(block, /action = "keep"/);
  assert.match(block, /error && !isUniqueViolation\(error\)/);
});

test('phase 5A keeps the unpaid void path and tenant checks intact', () => {
  const preClaim = between(
    'let activeReceipt: any = null;',
    'const academy = academyAccess.academy;'
  );

  assert.match(preClaim, /if \(!paid\)/);
  assert.match(preClaim, /Receipt tenant mismatch/);
  assert.match(preClaim, /Payment tenant mismatch/);
  assert.match(preClaim, /from\("payment_events"\)\.delete\(\)/);
});
