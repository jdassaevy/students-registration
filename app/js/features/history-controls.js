(function (root) {
    if (!root.document) return;

    const document = root.document;
    const RECEIPTS_SCOPE = 'receipts';
    const AUTOMATION_SCOPE = 'automation-activity';

    const helper = () => root.DassaevyHistoryVisibility || null;
    const academyId = () => String(root.currentAcademyId || '').trim();
    const notify = message => {
        if (typeof toast === 'function') toast(message);
    };

    function parsePtBrDate(value) {
        const match = String(value || '').match(
            /(\d{1,2})\/(\d{1,2})\/(\d{4}),?\s+(\d{1,2}):(\d{2})(?::(\d{2}))?/
        );
        if (!match) return 0;
        const [, day, month, year, hour, minute, second = '0'] = match;
        const timestamp = new Date(
            Number(year),
            Number(month) - 1,
            Number(day),
            Number(hour),
            Number(minute),
            Number(second)
        ).getTime();
        return Number.isFinite(timestamp) ? timestamp : 0;
    }

    function ensureActions(refreshButton, clearId, clearLabel, onClear) {
        if (!refreshButton || document.getElementById(clearId)) return;
        const parent = refreshButton.parentElement;
        if (!parent) return;

        const actions = document.createElement('div');
        actions.className = 'history-actions';
        const clearButton = document.createElement('button');
        clearButton.type = 'button';
        clearButton.className = 'btn btn-light history-clear-action';
        clearButton.id = clearId;
        clearButton.textContent = clearLabel;
        clearButton.addEventListener('click', onClear);

        parent.insertBefore(actions, refreshButton);
        actions.append(clearButton, refreshButton);
    }

    function setLocalEmpty(holder, key, show, message) {
        if (!holder) return;
        const selector = `[data-history-empty="${key}"]`;
        const existing = holder.querySelector(selector);
        if (!show) {
            if (existing) existing.remove();
            return;
        }
        if (existing) return;
        const empty = document.createElement('div');
        empty.className = 'history-local-empty';
        empty.dataset.historyEmpty = key;
        empty.textContent = message;
        holder.appendChild(empty);
    }

    function applyReceiptVisibility() {
        const visibility = helper();
        const holder = document.getElementById('receiptHistoryList');
        const clearButton = document.getElementById('clearReceiptsBtn');
        if (!visibility || !holder) return;

        const items = Array.isArray(root.Receipts?.items) ? root.Receipts.items : [];
        const rows = [...holder.querySelectorAll('tbody tr')];
        if (!items.length || !rows.length) {
            if (clearButton) clearButton.disabled = true;
            setLocalEmpty(holder, RECEIPTS_SCOPE, false, '');
            return;
        }

        const visibleIds = new Set(
            visibility.visibleAfter(RECEIPTS_SCOPE, academyId(), items)
                .map(item => String(item.id || ''))
        );

        rows.forEach((row, index) => {
            const item = items[index];
            row.hidden = Boolean(item) && !visibleIds.has(String(item.id || ''));
        });

        const hasVisible = rows.some(row => !row.hidden);
        if (clearButton) clearButton.disabled = !hasVisible;
        setLocalEmpty(
            holder,
            RECEIPTS_SCOPE,
            !hasVisible,
            'Histórico de recibos limpo. Novos recibos aparecerão aqui normalmente.'
        );
    }

    function automationRows() {
        const holder = document.getElementById('automationActivity');
        return holder ? [...holder.querySelectorAll('.automation-row')] : [];
    }

    function automationTimestamp(row) {
        return parsePtBrDate(row?.children?.[3]?.textContent || '');
    }

    function applyAutomationVisibility() {
        const visibility = helper();
        const holder = document.getElementById('automationActivity');
        const clearButton = document.getElementById('automationClearHistory');
        if (!visibility || !holder) return;

        const rows = automationRows();
        if (!rows.length) {
            if (clearButton) clearButton.disabled = true;
            setLocalEmpty(holder, AUTOMATION_SCOPE, false, '');
            return;
        }

        rows.forEach(row => {
            const timestamp = automationTimestamp(row);
            row.hidden = !visibility.isVisibleTimestamp(
                AUTOMATION_SCOPE,
                academyId(),
                timestamp
            );
        });

        const hasVisible = rows.some(row => !row.hidden);
        if (clearButton) clearButton.disabled = !hasVisible;
        setLocalEmpty(
            holder,
            AUTOMATION_SCOPE,
            !hasVisible,
            'Atividade recente limpa. Novas automações aparecerão aqui normalmente.'
        );
    }

    function clearReceiptHistory() {
        const visibility = helper();
        const items = Array.isArray(root.Receipts?.items) ? root.Receipts.items : [];
        if (!visibility || !items.length) return;
        if (!confirm('Limpar o histórico de recibos exibido? Os recibos e PDFs continuarão armazenados.')) return;

        visibility.clearThrough(RECEIPTS_SCOPE, academyId(), items);
        applyReceiptVisibility();
        notify('Histórico de recibos limpo.');
    }

    function clearAutomationActivity() {
        const visibility = helper();
        const rows = automationRows();
        if (!visibility || !rows.length) return;
        if (!confirm('Limpar a atividade recente exibida? Os registros internos das automações serão preservados.')) return;

        const timestampItems = rows
            .map(automationTimestamp)
            .filter(Boolean)
            .map(timestamp => ({created_at: new Date(timestamp).toISOString()}));
        if (timestampItems.length) {
            visibility.clearThrough(AUTOMATION_SCOPE, academyId(), timestampItems);
        } else {
            visibility.clearNow(AUTOMATION_SCOPE, academyId());
        }
        applyAutomationVisibility();
        notify('Atividade recente limpa.');
    }

    function enhance() {
        ensureActions(
            document.getElementById('refreshReceiptsBtn'),
            'clearReceiptsBtn',
            'Limpar histórico',
            clearReceiptHistory
        );
        ensureActions(
            document.getElementById('automationRefresh'),
            'automationClearHistory',
            'Limpar atividade',
            clearAutomationActivity
        );
        applyReceiptVisibility();
        applyAutomationVisibility();
    }

    let scheduled = false;
    const scheduleEnhance = () => {
        if (scheduled) return;
        scheduled = true;
        queueMicrotask(() => {
            scheduled = false;
            enhance();
        });
    };

    const observer = new MutationObserver(scheduleEnhance);
    const start = () => {
        enhance();
        observer.observe(document.body, {childList: true, subtree: true});
    };

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', start, {once: true});
    } else {
        start();
    }

    root.DassaevyHistoryControls = {
        applyReceiptVisibility,
        applyAutomationVisibility,
        clearReceiptHistory,
        clearAutomationActivity
    };
})(typeof window !== 'undefined' ? window : globalThis);
