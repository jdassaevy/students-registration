(() => {
    if (typeof toggleEntry !== 'function' || typeof toggleMonth !== 'function' || typeof db === 'undefined') return;

    function paymentAutomationSummary(whatsapp) {
        if (!whatsapp || typeof whatsapp !== 'object') return 'receipt_only';
        const states = Object.values(whatsapp);
        if (states.includes('sent') || states.includes('delivered') || states.includes('read')) return 'processed';
        if (states.includes('not_configured')) return 'waiting_meta';
        if (states.every(state => state === 'disabled' || state === 'skipped')) return 'receipt_only';
        return 'processed';
    }

    async function processLifecycle({studentId, person, kind, installment = 0}) {
        try {
            const {data, error} = await db.functions.invoke('payment-lifecycle', {
                body: {student_id: studentId, person, kind, installment}
            });
            if (error) throw error;
            if (window.Receipts?.load) await window.Receipts.load();
            if (data?.action === 'create') {
                const summary = paymentAutomationSummary(data.whatsapp);
                toast(summary === 'processed'
                    ? 'Pagamento salvo, recibo gerado e automação processada.'
                    : 'Pagamento salvo e recibo PDF gerado.');
            } else if (data?.action === 'void') {
                toast('Pagamento desmarcado e recibo estornado.');
            }
            window.dispatchEvent(new CustomEvent('payment:lifecycle', {detail: data || {}}));
        } catch (error) {
            console.error('payment lifecycle failed', error);
            toast('Pagamento atualizado, mas a automação do recibo precisa ser verificada.');
        }
    }

    const previousToggleEntry = toggleEntry;
    toggleEntry = async function(id, person) {
        const student = couples.find(item => item.id === id);
        const before = Boolean(student?.entryPayments?.[person]);
        await previousToggleEntry(id, person);
        const after = Boolean(student?.entryPayments?.[person]);
        if (before !== after) await processLifecycle({studentId: id, person, kind: 'entry'});
    };

    const previousToggleMonth = toggleMonth;
    toggleMonth = async function(id, person, index) {
        const student = couples.find(item => item.id === id);
        const before = Boolean(student?.payments?.[person]?.[index]);
        await previousToggleMonth(id, person, index);
        const after = Boolean(student?.payments?.[person]?.[index]);
        if (before !== after) await processLifecycle({studentId: id, person, kind: 'monthly', installment: index + 1});
    };

    window.PaymentAutomationTest = { paymentAutomationSummary };
})();
