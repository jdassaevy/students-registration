(() => {
    const SELECTORS = 'select.class-filter, #coupleClass';
    const registry = new Map();

    function closeAll(except = null) {
        registry.forEach(({root, trigger}) => {
            if (root === except) return;
            root.classList.remove('is-open');
            trigger.setAttribute('aria-expanded', 'false');
        });
    }

    function enhance(select) {
        if (!select || registry.has(select) || select.dataset.customSelect === 'true') return;
        select.dataset.customSelect = 'true';
        select.classList.add('custom-select-native');

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
                    root.classList.remove('is-open');
                    trigger.setAttribute('aria-expanded', 'false');
                    trigger.focus({preventScroll: true});
                });
                menu.appendChild(item);
            });
        }

        trigger.addEventListener('click', () => {
            const opening = !root.classList.contains('is-open');
            closeAll(root);
            root.classList.toggle('is-open', opening);
            trigger.setAttribute('aria-expanded', String(opening));
        });

        trigger.addEventListener('keydown', event => {
            if (event.key === 'Escape') {
                root.classList.remove('is-open');
                trigger.setAttribute('aria-expanded', 'false');
            }
        });

        select.addEventListener('change', renderOptions);
        const observer = new MutationObserver(renderOptions);
        observer.observe(select, {childList: true, subtree: true, attributes: true});
        registry.set(select, {root, trigger, observer, renderOptions});
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
