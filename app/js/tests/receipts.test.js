const assert = require('node:assert/strict');
const {
    paymentLabel,
    receiptStatusLabel,
    canVoidReceipt,
    canRepairReceipt,
    buildReceiptIdentity
} = require('../features/receipts.js');

assert.equal(paymentLabel({kind: 'entry', installment: 0}), 'Inscrição');
assert.equal(paymentLabel({kind: 'monthly', installment: 1}), '1ª Mensalidade');
assert.equal(paymentLabel({kind: 'monthly', installment: 3}), '3ª Mensalidade');
assert.equal(receiptStatusLabel('active'), 'Ativo');
assert.equal(receiptStatusLabel('voided'), 'Estornado');
assert.equal(canVoidReceipt({status: 'active'}), true);
assert.equal(canVoidReceipt({status: 'voided'}), false);
assert.equal(
    canRepairReceipt({kind: 'monthly', status: 'active', storage_path: null}),
    true
);
assert.equal(
    canRepairReceipt({kind: 'entry', status: 'active', storage_path: null}),
    false
);
assert.equal(
    canRepairReceipt({kind: 'monthly', status: 'voided', storage_path: null}),
    false
);
assert.equal(
    canRepairReceipt({kind: 'monthly', status: 'active', storage_path: 'u/r.pdf'}),
    false
);
assert.equal(
    buildReceiptIdentity({studentId: 's1', person: 'person1', kind: 'monthly', installment: 2}),
    's1:person1:monthly:2'
);

console.log('receipts tests passed');
