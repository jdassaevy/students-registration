(() => {
    const SELECTORS = 'select.class-filter, #coupleClass';
    const registry = new Map();

    function setOpenState(entry, open) {
        const {root, trigger, host} = entry;
        root.classList.toggle('is-open', open);
        trigger.setAttribute('aria-expanded', String(open));
        host?.classList.toggle('custom-select-host-open', open);
    }

    function closeAll(except = null) {
        registry.forEach(entry => {
            if (entry.root === except) return;
            setOpenState(entry, false);
        });
    }

    function enhance(select) {
        if (!select || registry.has(select) || select.dataset.customSelect === 'true') return;
        select.dataset.customSelect = 'true';
        select.classList.add('custom-select-native');

        const host = select.closest('.financial-head, .reports-head, .toolbar, .field');
        const root = document.createElement('div');
        root.className = 'custom-select';
        select.parentNode.insertBefore(root, select);
        root.appendChild(select);

        const trigger = document.createElement('button');
        trigger.type = 'button';
        trigger.className = 'custom-select-trigger';
        trigger.setAttribute('aria-haspopup', 'listbox');
        trigger.setAttribute('aria-expanded', 'false');
        trigger.innerHTML = '<span class="custom-select-value"></span><span class="custom-select-chevron" aria-hidden="true">⌄</span>';

        const menu = document.createElement('div');
        menu.className = 'custom-select-menu';
        menu.setAttribute('role', 'listbox');
        root.append(trigger, menu);

        const entry = {root, trigger, host, renderOptions: null};

        function renderOptions() {
            const selected = select.options[select.selectedIndex];
            trigger.querySelector('.custom-select-value').textContent = selected?.textContent || 'Selecione';
            trigger.disabled = select.disabled;
            menu.innerHTML = '';
            [...select.options].forEach(option => {
                const item = document.createElement('button');
                item.type = 'button';
                item.className = 'custom-select-option';
                item.setAttribute('role', 'option');
                item.setAttribute('aria-selected', String(option.selected));
                item.dataset.value = option.value;
                item.textContent = option.textContent;
                item.disabled = option.disabled;
                if (option.selected) item.classList.add('is-selected');
                item.addEventListener('click', () => {
                    if (select.value !== option.value) {
                        select.value = option.value;
                        select.dispatchEvent(new Event('change', {bubbles: true}));
                    }
                    renderOptions();
                    setOpenState(entry, false);
                    trigger.focus({preventScroll: true});
                });
                menu.appendChild(item);
            });
        }

        entry.renderOptions = renderOptions;

        trigger.addEventListener('click', () => {
            const opening = !root.classList.contains('is-open');
            closeAll(root);
            setOpenState(entry, opening);
        });

        trigger.addEventListener('keydown', event => {
            if (event.key === 'Escape') setOpenState(entry, false);
        });

        select.addEventListener('change', renderOptions);
        const observer = new MutationObserver(renderOptions);
        observer.observe(select, {childList: true, subtree: true, attributes: true});
        entry.observer = observer;
        registry.set(select, entry);
        renderOptions();
    }

    function scan() {
        document.querySelectorAll(SELECTORS).forEach(enhance);
    }

    document.addEventListener('click', event => {
        if (!event.target.closest('.custom-select')) closeAll();
    });

    document.addEventListener('keydown', event => {
        if (event.key === 'Escape') closeAll();
    });

    const pageObserver = new MutationObserver(scan);
    pageObserver.observe(document.body, {childList: true, subtree: true});
    scan();
})();
