function paymentAutomationSummary(whatsapp) {
    if (!whatsapp || typeof whatsapp !== 'object') return 'receipt_only';
    const states = Object.values(whatsapp);
    if (states.includes('sent') || states.includes('delivered') || states.includes('read')) return 'processed';
    if (states.includes('not_configured')) return 'waiting_meta';
    if (states.every(state => state === 'disabled' || state === 'skipped')) return 'receipt_only';
    return 'processed';
}

function paymentLifecycleMessage(data) {
    if (!data) return null;

    if (data.action === 'repair') return 'Recibo gerado com sucesso.';
    if (data.action === 'repair_pending') {
        return 'O pagamento continua registrado, mas o PDF ainda não pôde ser gerado.';
    }

    if (data.pdf_status === 'pending') {
        const confirmation = data.whatsapp?.payment_confirmation;
        const sent = ['sent', 'delivered', 'read'].includes(confirmation);
        return sent
            ? 'Pagamento registrado e confirmação enviada. O PDF do recibo ficou pendente e poderá ser gerado novamente.'
            : 'Pagamento registrado. O PDF do recibo ficou pendente e poderá ser gerado novamente.';
    }

    if (data.action === 'create') {
        const summary = paymentAutomationSummary(data.whatsapp);
        return summary === 'processed'
            ? 'Pagamento salvo, recibo gerado e automação processada.'
            : 'Pagamento salvo e recibo PDF gerado.';
    }
    if (data.action === 'void') return 'Pagamento desmarcado e recibo estornado.';
    return null;
}

function collectPaymentChanges(before, after) {
    if (!after) return [];
    const previous = before || {};
    const people = ['person1'];
    if (previous.person2 || after.person2) people.push('person2');
    const changes = [];

    people.forEach(person => {
        const beforeEntry = Boolean(previous.entryPayments?.[person]);
        const afterEntry = Boolean(after.entryPayments?.[person]);
        if (beforeEntry !== afterEntry) {
            changes.push({person, kind: 'entry', installment: 0, expectedPaid: afterEntry});
        }
        for (let index = 0; index < 3; index += 1) {
            const beforePaid = Boolean(previous.payments?.[person]?.[index]);
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

async function processSavedStudent(before, after, processor) {
    if (!after?.id || typeof processor !== 'function') return [];
    const results = [];
    for (const change of collectPaymentChanges(before, after)) {
        results.push(await processor({studentId: after.id, ...change}));
    }
    return results;
}

function functionErrorStatus(error) {
    const contextStatus = Number(error?.context?.status);
    if (Number.isFinite(contextStatus)) return contextStatus;

    const status = Number(error?.status);
    return Number.isFinite(status) ? status : null;
}

function isUnauthorizedFunctionError(error) {
    return functionErrorStatus(error) === 401;
}

function expiredSessionError(cause) {
    const error = new Error('Authentication session expired');
    error.code = 'AUTH_SESSION_EXPIRED';
    error.cause = cause;
    return error;
}

async function invokeWithSessionRecovery({invoke, refreshSession}) {
    const first = await invoke(null);
    if (!first?.error || !isUnauthorizedFunctionError(first.error)) {
        return first;
    }

    const refreshed = await refreshSession();
    const accessToken = refreshed?.data?.session?.access_token;
    if (refreshed?.error || !accessToken) {
        return {
            data: null,
            error: expiredSessionError(refreshed?.error || first.error)
        };
    }

    const retry = await invoke(accessToken);
    if (retry?.error && isUnauthorizedFunctionError(retry.error)) {
        return {
            data: null,
            error: expiredSessionError(retry.error)
        };
    }

    return retry;
}

if (typeof module !== 'undefined' && module.exports) {
    module.exports = {
        collectPaymentChanges,
        paymentAutomationSummary,
        paymentLifecycleMessage,
        processSavedStudent,
        invokeWithSessionRecovery
    };
}

if (typeof window !== 'undefined') {
    (() => {
        if (typeof toggleEntry !== 'function' || typeof toggleMonth !== 'function' || typeof db === 'undefined') return;

        async function invokeLifecycle(body) {
            return invokeWithSessionRecovery({
                invoke: accessToken => db.functions.invoke('payment-lifecycle', {
                    body,
                    ...(accessToken
                        ? {headers: {Authorization: `Bearer ${accessToken}`}}
                        : {})
                }),
                refreshSession: () => db.auth.refreshSession()
            });
        }

        async function processLifecycle({studentId, person, kind, installment = 0}) {
            try {
                const {data, error} = await invokeLifecycle({
                    student_id: studentId,
                    person,
                    kind,
                    installment
                });
                if (error) throw error;
                if (window.Receipts?.invalidate) await window.Receipts.invalidate();
                const message = paymentLifecycleMessage(data);
                if (message) toast(message);
                window.dispatchEvent(new CustomEvent('payment:lifecycle', {detail: data || {}}));
                return data || {};
            } catch (error) {
                globalThis.ClientLogging?.report('payment-lifecycle', error);
                toast(
                    error?.code === 'AUTH_SESSION_EXPIRED'
                        ? 'Pagamento atualizado, mas sua sessão expirou. Entre novamente para concluir a automação.'
                        : 'Pagamento atualizado, mas a automação do recibo precisa ser verificada.'
                );
                return null;
            }
        }

        async function repairMonthlyReceipt(receiptId) {
            try {
                const {data, error} = await invokeLifecycle({
                    operation: 'repair_monthly_receipt',
                    receipt_id: receiptId
                });
                if (error) throw error;
                const message = paymentLifecycleMessage(data);
                if (message) toast(message);
                window.dispatchEvent(new CustomEvent('payment:lifecycle', {detail: data || {}}));
                return data || {};
            } catch (error) {
                globalThis.ClientLogging?.report('monthly-receipt-repair', error);
                toast('O pagamento continua registrado, mas o PDF ainda não pôde ser gerado.');
                return null;
            }
        }

        const previousToggleEntry = toggleEntry;
        toggleEntry = async function (id, person) {
            const student = couples.find(item => item.id === id);
            const before = Boolean(student?.entryPayments?.[person]);
            await previousToggleEntry(id, person);
            const after = Boolean(student?.entryPayments?.[person]);
            if (before !== after) await processLifecycle({studentId: id, person, kind: 'entry'});
        };

        const previousToggleMonth = toggleMonth;
        toggleMonth = async function (id, person, index) {
            const student = couples.find(item => item.id === id);
            const before = Boolean(student?.payments?.[person]?.[index]);
            await previousToggleMonth(id, person, index);
            const after = Boolean(student?.payments?.[person]?.[index]);
            if (before !== after) {
                await processLifecycle({studentId: id, person, kind: 'monthly', installment: index + 1});
            }
        };

        window.PaymentAutomation = {
            collectPaymentChanges,
            processLifecycle,
            repairMonthlyReceipt,
            processSavedStudent: (before, after) => processSavedStudent(before, after, processLifecycle)
        };
        window.PaymentAutomationTest = {
            collectPaymentChanges,
            paymentAutomationSummary,
            paymentLifecycleMessage,
            processSavedStudent
        };
    })();
}
