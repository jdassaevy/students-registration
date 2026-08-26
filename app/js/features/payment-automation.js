function paymentAutomationSummary(whatsapp) {
    if (!whatsapp || typeof whatsapp !== 'object')
        return 'receipt_only';
    const states = Object.values(whatsapp);
    if (states.includes('sent') || states.includes('delivered') || states.includes('read'))
        return 'processed';
    if (states.includes('not_configured'))
        return 'waiting_meta';
    if (states.every(state => state === 'disabled' || state === 'skipped'))
        return 'receipt_only';
    return 'processed';
}

function collectPaymentChanges(before, after) {
    if (!before || !after)
        return [];

    const changes = [];
    const people = ['person1'];
    if (after.person2)
        people.push('person2');

    people.forEach(person => {
        const beforeEntry = Boolean(before.entryPayments?.[person]);
        const afterEntry = Boolean(after.entryPayments?.[person]);
        if (beforeEntry !== afterEntry) {
            changes.push({
                person,
                kind: 'entry',
                installment: 0,
                expectedPaid: afterEntry
            });
        }

        for (let index = 0; index < 3; index += 1) {
            const beforePaid = Boolean(before.payments?.[person]?.[index]);
            const afterPaid = Boolean(after.payments?.[person]?.[index]);
            if (beforePaid !== afterPaid) {
                changes.push({
                    person,
                    kind: 'monthly',
                    installment: index + 1,
                    expectedPaid: afterPaid
                });
            }
        }
    });

    return changes;
}

if (typeof module !== 'undefined' && module.exports) {
    module.exports = {
        collectPaymentChanges,
        paymentAutomationSummary
    };
}

if (typeof window !== 'undefined') {
    (() => {
        if (
            typeof toggleEntry !== 'function' ||
            typeof toggleMonth !== 'function' ||
            typeof db === 'undefined'
        )
            return;

        async function processLifecycle({
            studentId,
            person,
            kind,
            installment = 0
        }) {
            try {
                const {data, error} = await db
                    .functions
                    .invoke('payment-lifecycle', {
                        body: {
                            student_id: studentId,
                            person,
                            kind,
                            installment
                        }
                    });
                if (error)
                    throw error;
                if (window.Receipts?.load)
                    await window.Receipts.load();
                if (data?.action === 'create') {
                    const summary = paymentAutomationSummary(data.whatsapp);
                    toast(
                        summary === 'processed'
                            ? 'Pagamento salvo, recibo gerado e automação processada.'
                            : 'Pagamento salvo e recibo PDF gerado.'
                    );
                } else if (data?.action === 'void') {
                    toast('Pagamento desmarcado e recibo estornado.');
                }
                window.dispatchEvent(new CustomEvent('payment:lifecycle', {
                    detail: data || {}
                }));
                return data || {};
            } catch (error) {
                console.error('payment lifecycle failed', error);
                toast(
                    'Pagamento atualizado, mas a automação do recibo precisa ser verificada.'
                );
                return null;
            }
        }

        const previousToggleEntry = toggleEntry;
        toggleEntry = async function (id, person) {
            const student = couples.find(item => item.id === id);
            const before = Boolean(student?.entryPayments?.[person]);
            await previousToggleEntry(id, person);
            const after = Boolean(student?.entryPayments?.[person]);
            if (before !== after)
                await processLifecycle({studentId: id, person, kind: 'entry'});
        };

        const previousToggleMonth = toggleMonth;
        toggleMonth = async function (id, person, index) {
            const student = couples.find(item => item.id === id);
            const before = Boolean(student?.payments?.[person]?.[index]);
            await previousToggleMonth(id, person, index);
            const after = Boolean(student?.payments?.[person]?.[index]);
            if (before !== after) {
                await processLifecycle({
                    studentId: id,
                    person,
                    kind: 'monthly',
                    installment: index + 1
                });
            }
        };

        let pendingFormChanges = [];
        const form = document.getElementById('form');
        const modal = document.getElementById('modal');

        if (form && modal) {
            form.addEventListener('submit', () => {
                const studentId = document.getElementById('editingId')?.value || '';
                if (!studentId) {
                    pendingFormChanges = [];
                    return;
                }

                const before = couples.find(item => item.id === studentId);
                if (!before) {
                    pendingFormChanges = [];
                    return;
                }

                const person2 = document.getElementById('person2')?.value.trim() || '';
                const after = {
                    person2,
                    entryPayments: {
                        person1: Boolean(document.getElementById('p1Entry')?.checked),
                        person2: person2
                            ? Boolean(document.getElementById('p2Entry')?.checked)
                            : false
                    },
                    payments: {
                        person1: [1, 2, 3].map(index => Boolean(
                            document.getElementById(`p1m${index}`)?.checked
                        )),
                        person2: person2
                            ? [1, 2, 3].map(index => Boolean(
                                document.getElementById(`p2m${index}`)?.checked
                            ))
                            : [false, false, false]
                    }
                };

                pendingFormChanges = collectPaymentChanges(before, after).map(change => ({
                    ...change,
                    studentId
                }));
            });

            modal.addEventListener('close', async () => {
                if (!pendingFormChanges.length)
                    return;

                const changes = pendingFormChanges;
                pendingFormChanges = [];

                for (const change of changes) {
                    const student = couples.find(item => item.id === change.studentId);
                    if (!student)
                        continue;

                    const actualPaid = change.kind === 'entry'
                        ? Boolean(student.entryPayments?.[change.person])
                        : Boolean(student.payments?.[change.person]?.[change.installment - 1]);

                    if (actualPaid !== change.expectedPaid)
                        continue;

                    await processLifecycle(change);
                }
            });
        }

        window.PaymentAutomation = {
            processLifecycle,
            collectPaymentChanges
        };
        window.PaymentAutomationTest = {
            paymentAutomationSummary,
            collectPaymentChanges
        };
    })();
}
