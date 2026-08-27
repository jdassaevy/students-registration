import assert from 'node:assert/strict';
import {
    isUniqueViolation,
    paymentNotificationAmount,
    paymentReceiptAmount,
    receiptNeedsPdf
} from './payment-lifecycle.ts';

assert.equal(
    receiptNeedsPdf({status: 'active', storage_path: null}),
    true,
    'an active receipt without a storage path must be regenerated'
);
assert.equal(receiptNeedsPdf({status: 'active', storage_path: 'owner/receipt.pdf'}), false);
assert.equal(receiptNeedsPdf({status: 'voided', storage_path: null}), false);

assert.equal(isUniqueViolation({code: '23505'}), true);
assert.equal(isUniqueViolation({code: 'PGRST116'}), false);

assert.equal(
    paymentNotificationAmount('void', {amount: 125}, 0),
    125,
    'void notifications must retain the historical receipt amount after person2 is removed'
);
assert.equal(paymentNotificationAmount('create', null, 90), 90);
assert.equal(
    paymentReceiptAmount({amount: 125}, 90),
    125,
    'PDF repair must use the audited receipt amount instead of the current fee'
);

console.log('payment lifecycle reliability tests passed');
