import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const source = fs.readFileSync(
  new URL('../../../supabase/functions/payment-lifecycle/index.ts', import.meta.url),
  'utf8'
);

function sliceBetween(startMarker, endMarker, from = 0) {
  const start = source.indexOf(startMarker, from);
  const end = source.indexOf(endMarker, start);
  assert.ok(start >= 0, `missing start marker: ${startMarker}`);
  assert.ok(end > start, `missing end marker: ${endMarker}`);
  return source.slice(start, end);
}

test('paid payment events claim idempotency with insert first', () => {
  const block = sliceBetween(
    'let paymentEvent: any = null;',
    'const academy = academyAccess.academy;'
  );

  assert.doesNotMatch(block, /data:\s*existingEvent/);

  const insert = block.indexOf('.from("payment_events").insert({');
  const fallbackRead = block.indexOf('.from("payment_events").select("*")');

  assert.ok(insert >= 0, 'payment event insert must exist');
  assert.ok(fallbackRead > insert, 'payment event fallback read must happen only after insert');
  assert.match(block, /if \(error && !isUniqueViolation\(error\)\) throw error/);
  assert.match(block, /concurrentEvent\.academy_id !== student\.academy_id/);
});

test('active receipt lookup is reserved for the unpaid void path', () => {
  const normalStart = source.indexOf('const paid = paymentIsMarked');
  const paymentEventStart = source.indexOf('let paymentEvent: any = null;', normalStart);
  const preClaim = source.slice(normalStart, paymentEventStart);

  assert.doesNotMatch(preClaim, /data:\s*activeReceipt/);
  assert.match(
    preClaim,
    /if \(!paid\)\s*\{[\s\S]*?from\("receipts"\)\.select\("\*"\)[\s\S]*?receiptActionForState\(\{\s*paid,\s*hasActiveReceipt:\s*Boolean\(activeReceipt\)\s*\}\)/
  );
});

test('paid receipts claim the unique active slot with insert first', () => {
  const block = sliceBetween(
    'let receipt: any = activeReceipt || null;',
    'if (receipt && !receiptMatchesStudent(receipt, student))'
  );

  const insert = block.indexOf('.from("receipts").insert({');
  const fallbackRead = block.indexOf('.from("receipts").select("*")');

  assert.ok(insert >= 0, 'receipt insert must exist');
  assert.ok(fallbackRead > insert, 'receipt fallback read must happen only after insert');
  assert.match(block, /if \(error && !isUniqueViolation\(error\)\) throw error/);
  assert.match(block, /action = "create"/);
  assert.match(block, /action = "keep"/);
  assert.match(block, /concurrentReceipt/);
});

test('shared unique-violation helper remains the concurrency gate', () => {
  assert.match(
    source,
    /import \{[^}]*isUniqueViolation[^}]*\} from ["']\.\.\/_shared\/payment-lifecycle\.ts["']/
  );
});
