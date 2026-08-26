const assert = require('node:assert/strict');
const {
    collectPaymentChanges,
    paymentAutomationSummary
} = require('../features/payment-automation.js');

const before = {
    person2: 'Maria',
    entryPayments: {person1: false, person2: true},
    payments: {
        person1: [false, false, false],
        person2: [true, false, false]
    }
};

const after = {
    person2: 'Maria',
    entryPayments: {person1: true, person2: true},
    payments: {
        person1: [false, true, false],
        person2: [true, false, false]
    }
};

assert.deepEqual(
    collectPaymentChanges(before, after),
    [
        {
            person: 'person1',
            kind: 'entry',
            installment: 0,
            expectedPaid: true
        },
        {
            person: 'person1',
            kind: 'monthly',
            installment: 2,
            expectedPaid: true
        }
    ],
    'editing an existing student must expose every payment transition to the lifecycle'
);

assert.deepEqual(
    collectPaymentChanges(after, before),
    [
        {
            person: 'person1',
            kind: 'entry',
            installment: 0,
            expectedPaid: false
        },
        {
            person: 'person1',
            kind: 'monthly',
            installment: 2,
            expectedPaid: false
        }
    ],
    'unmarking payments must also expose transitions so receipts can be voided'
);

assert.equal(paymentAutomationSummary({receipt_document: 'sent'}), 'processed');
assert.equal(paymentAutomationSummary({receipt_document: 'not_configured'}), 'waiting_meta');

console.log('payment automation trigger tests passed');
