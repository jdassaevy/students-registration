import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const source = fs.readFileSync(
  new URL('../../../supabase/functions/payment-lifecycle/index.ts', import.meta.url),
  'utf8'
);

test('phase 5B starts automation settings read before payment mutation work', () => {
  const settingsStart = source.indexOf('const settingsPromise = admin.from("automation_settings")');
  const paymentMutation = source.indexOf('let paymentEvent: any = null;');
  const receiptClaim = source.indexOf('let receipt: any = activeReceipt || null;');
  const settingsAwait = source.indexOf('await settingsPromise');

  assert.ok(settingsStart >= 0, 'settings prefetch must exist');
  assert.ok(settingsStart < paymentMutation, 'settings read must start before payment event mutation');
  assert.ok(settingsStart < receiptClaim, 'settings read must overlap receipt claim work');
  assert.ok(settingsAwait > receiptClaim, 'settings read should only be awaited after receipt claim work');
});

test('phase 5B starts monthly PDF generation before waiting for payment confirmation', () => {
  const taskStart = source.indexOf('const monthlyPdfTask =');
  const confirmation = source.indexOf('sendLogged("payment_confirmation"');
  const taskAwait = source.indexOf('await monthlyPdfTask');
  const documentSend = source.indexOf('sendLogged("receipt_document"');

  assert.ok(taskStart >= 0, 'monthly PDF task must exist');
  assert.ok(taskStart < confirmation, 'monthly PDF generation must start before confirmation send finishes');
  assert.ok(confirmation < taskAwait, 'confirmation must still be processed before monthly PDF result is consumed');
  assert.ok(taskAwait < documentSend, 'receipt document must still be sent only after PDF generation completes');
});

test('phase 5B settles the monthly PDF promise immediately so failures remain partial success', () => {
  const taskStart = source.indexOf('const monthlyPdfTask =');
  const taskEnd = source.indexOf(': null;', taskStart);
  const taskBlock = source.slice(taskStart, taskEnd);

  assert.match(taskBlock, /\.then\(generatedReceipt => \(\{ receipt: generatedReceipt, error: null \}\)\)/);
  assert.match(taskBlock, /\.catch\(error => \(\{ receipt: null, error \}\)\)/);

  const consumeStart = source.indexOf('const monthlyPdfResult = await monthlyPdfTask');
  const consumeBlock = source.slice(consumeStart, consumeStart + 1000);
  assert.match(consumeBlock, /if \(monthlyPdfResult\.error\)/);
  assert.match(consumeBlock, /pdfStatus = "pending"/);
  assert.match(consumeBlock, /monthly_receipt_pdf_pending/);
});

test('phase 5B preserves tenant validation after overlapped monthly PDF generation', () => {
  const consumeStart = source.indexOf('const monthlyPdfResult = await monthlyPdfTask');
  const consumeBlock = source.slice(consumeStart, consumeStart + 1200);

  assert.match(consumeBlock, /receipt = monthlyPdfResult\.receipt/);
  assert.match(consumeBlock, /receiptMatchesStudent\(receipt, student\)/);
  assert.match(consumeBlock, /Receipt tenant mismatch/);
});
