import assert from 'node:assert/strict';
import fs from 'node:fs';

const shared = fs.readFileSync(
  new URL('../../../supabase/functions/_shared/whatsapp.ts', import.meta.url),
  'utf8'
);
const sender = fs.readFileSync(
  new URL('../../../supabase/functions/send-whatsapp/index.ts', import.meta.url),
  'utf8'
);

assert.ok(
  shared.includes('receiptDocument: "dassaevy_receipt_document"'),
  'receipt delivery must have a dedicated approved template name'
);
assert.ok(
  shared.includes('buildDocumentTemplatePayload'),
  'shared WhatsApp helpers must build a template payload with a document header'
);
assert.ok(
  sender.includes('buildDocumentTemplatePayload'),
  'receipt_document must use the document template payload builder'
);
assert.ok(
  !sender.includes('payload = buildDocumentPayload({'),
  'receipt_document must not use free-form document messages outside the 24h window'
);

console.log('WhatsApp receipt template contract passed');
