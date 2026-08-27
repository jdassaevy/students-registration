const assert = require('node:assert/strict');
const {
    collectPaymentChanges,
    processSavedStudent
} = require('../features/payment-automation.js');

const unpaid = {
    id: 'student-1',
    person2: '',
    entryPayments: {person1: false, person2: false},
    payments: {
        person1: [false, false, false],
        person2: [false, false, false]
    }
};

const newlyPaid = {
    ...unpaid,
    entryPayments: {person1: true, person2: false},
    payments: {
        person1: [false, true, false],
        person2: [false, false, false]
    }
};

assert.deepEqual(
    collectPaymentChanges(null, newlyPaid),
    [
        {person: 'person1', kind: 'entry', installment: 0, expectedPaid: true},
        {person: 'person1', kind: 'monthly', installment: 2, expectedPaid: true}
    ],
    'a new student with marked payments must enter the lifecycle'
);

const beforeRemovingPerson2 = {
    ...unpaid,
    person2: 'Maria',
    entryPayments: {person1: false, person2: true},
    payments: {
        person1: [false, false, false],
        person2: [true, false, false]
    }
};

assert.deepEqual(
    collectPaymentChanges(beforeRemovingPerson2, unpaid),
    [
        {person: 'person2', kind: 'entry', installment: 0, expectedPaid: false},
        {person: 'person2', kind: 'monthly', installment: 1, expectedPaid: false}
    ],
    'removing person2 must void their active payment records'
);

(async () => {
    const calls = [];
    await processSavedStudent(unpaid, newlyPaid, async change => calls.push(change));

    assert.deepEqual(calls, [
        {
            studentId: 'student-1',
            person: 'person1',
            kind: 'entry',
            installment: 0,
            expectedPaid: true
        },
        {
            studentId: 'student-1',
            person: 'person1',
            kind: 'monthly',
            installment: 2,
            expectedPaid: true
        }
    ]);

    console.log('payment automation trigger tests passed');
})().catch(error => {
    console.error(error);
    process.exitCode = 1;
});
