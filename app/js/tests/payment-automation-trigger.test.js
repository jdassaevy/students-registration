const assert = require('node:assert/strict');
const {
    collectPaymentChanges,
    processSavedStudent,
    paymentLifecycleMessage,
    invokeWithSessionRecovery
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

assert.equal(
    paymentLifecycleMessage({
        action: 'create',
        pdf_status: 'pending',
        whatsapp: {payment_confirmation: 'sent'}
    }),
    'Pagamento registrado e confirmação enviada. O PDF do recibo ficou pendente e poderá ser gerado novamente.'
);

assert.equal(
    paymentLifecycleMessage({
        action: 'create',
        pdf_status: 'pending',
        whatsapp: {payment_confirmation: 'skipped'}
    }),
    'Pagamento registrado. O PDF do recibo ficou pendente e poderá ser gerado novamente.'
);

assert.equal(
    paymentLifecycleMessage({action: 'repair', pdf_status: 'ready'}),
    'Recibo gerado com sucesso.'
);

assert.equal(
    paymentLifecycleMessage({action: 'repair_pending', pdf_status: 'pending'}),
    'O pagamento continua registrado, mas o PDF ainda não pôde ser gerado.'
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


(async () => {
    let invokes = 0;
    let refreshes = 0;
    const result = await invokeWithSessionRecovery({
        invoke: async accessToken => {
            invokes += 1;
            if (invokes === 1) {
                return {
                    data: null,
                    error: {context: {status: 401}}
                };
            }
            assert.equal(accessToken, 'fresh-access-token');
            return {data: {action: 'create'}, error: null};
        },
        refreshSession: async () => {
            refreshes += 1;
            return {
                data: {session: {access_token: 'fresh-access-token'}},
                error: null
            };
        }
    });

    assert.equal(invokes, 2, '401 must retry exactly once');
    assert.equal(refreshes, 1, '401 must refresh the auth session once');
    assert.equal(result.error, null);
    assert.equal(result.data.action, 'create');
})().catch(error => {
    console.error(error);
    process.exitCode = 1;
});

(async () => {
    let invokes = 0;
    let refreshes = 0;
    const originalError = {context: {status: 500}};
    const result = await invokeWithSessionRecovery({
        invoke: async () => {
            invokes += 1;
            return {data: null, error: originalError};
        },
        refreshSession: async () => {
            refreshes += 1;
            return {data: {session: {access_token: 'unused'}}, error: null};
        }
    });

    assert.equal(invokes, 1, 'non-401 failures must not retry');
    assert.equal(refreshes, 0, 'non-401 failures must not refresh auth');
    assert.equal(result.error, originalError);
})().catch(error => {
    console.error(error);
    process.exitCode = 1;
});

(async () => {
    let invokes = 0;
    const result = await invokeWithSessionRecovery({
        invoke: async () => {
            invokes += 1;
            return {data: null, error: {context: {status: 401}}};
        },
        refreshSession: async () => ({
            data: {session: null},
            error: {code: 'session_not_found'}
        })
    });

    assert.equal(invokes, 1, 'a dead session must not retry with the revoked token');
    assert.equal(result.error?.code, 'AUTH_SESSION_EXPIRED');
})().catch(error => {
    console.error(error);
    process.exitCode = 1;
});
