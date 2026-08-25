(() => {
    const nav = document.querySelector('.view-tabs');
    if (!nav || nav.dataset.animatedTabBar === 'true') 
        return;
    nav.dataset.animatedTabBar = 'true';

    const TAB_META = {
        dashboardTab: {
            label: 'Visão Geral',
            icon: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 4h6v6H4zM14 4h6v6h-6zM' +
                    '4 14h6v6H4zM14 14h6v6h-6z"/></svg>'
        },
        studentsTab: {
            label: 'Alunos',
            icon: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M9 11a4 4 0 1 0 0-8 4 4 0' +
                    ' 0 0 0 8Zm6.5-1a3.5 3.5 0 1 0 0-7 3.5 3.5 0 0 0 0 7ZM2.5 20v-2.2c0-3.1 2.9-5.3' +
                    ' 6.5-5.3s6.5 2.2 6.5 5.3V20h-13Zm13.7 0v-2.2c0-1.7-.7-3.2-1.9-4.3.4-.1.8-.1 1.' +
                    '2-.1 3.3 0 6 2 6 4.8V20h-5.3Z"/></svg>'
        },
        financialTab: {
            label: 'Financeiro',
            icon: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 5h16a2 2 0 0 1 2 2v11a' +
                    '2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V7a2 2 0 0 1 2-2Zm0 3v10h16v-7h-5a3 3 0 0 1 0-6H4' +
                    'v3Zm11-1a1 1 0 1 0 0 2h5V7h-5Z"/></svg>'
        },
        reportsTab: {
            label: 'Relatórios',
            icon: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 20h16v2H2V4h2v16Zm3-2H' +
                    '5v-6h2v6Zm5 0H9V8h3v10Zm5 0h-3V3h3v15Zm4 0h-2v-9h2v9Z"/></svg>'
        },
        automationTab: {
            label: 'Automações',
            icon: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M13.2 2 5 13h5.7L9.8 22 1' +
                    '9 10h-5.8l0-8Z"/></svg>'
        }
    };

    const indicator = document.createElement('span');
    indicator.className = 'tab-indicator';
    indicator.setAttribute('aria-hidden', 'true');
    nav.prepend(indicator);

    function decorateTab(tab) {
        const meta = TAB_META[tab.id];
        if (!meta || tab.dataset.iconTab === 'true') 
            return;
        tab.dataset.iconTab = 'true';
        tab.setAttribute('aria-label', meta.label);
        tab.setAttribute('data-label', meta.label);
        tab.innerHTML = `<span class="view-tab-icon">${meta.icon}</span><span class="view-tab-label" aria-hidden="true">${meta.label}</span>`;
    }

    function activeTab() {
        return nav.querySelector('.view-tab.active');
    }

    function syncIndicator(animate = true) {
        const active = activeTab();
        if (!active) {
            indicator.style.opacity = '0';
            return;
        }
        const navRect = nav.getBoundingClientRect();
        const tabRect = active.getBoundingClientRect();
        indicator
            .classList
            .toggle('no-transition', !animate);
        indicator.style.width = `${tabRect.width}px`;
        indicator.style.height = `${tabRect.height}px`;
        indicator.style.transform = `translate3d(${tabRect.left - navRect.left}px, ${tabRect.top - navRect.top}px, 0)`;
        indicator.style.opacity = '1';
        if (!animate) 
            requestAnimationFrame(() => indicator.classList.remove('no-transition'));
        }
    
    function decorateAll() {
        nav
            .querySelectorAll('.view-tab')
            .forEach(decorateTab);
        requestAnimationFrame(() => syncIndicator(false));
    }

    nav.addEventListener('click', event => {
        const tab = event
            .target
            .closest('.view-tab');
        if (!tab) 
            return;
        requestAnimationFrame(() => syncIndicator(true));
    });

    const mutationObserver = new MutationObserver(() => decorateAll());
    mutationObserver.observe(nav, {
        childList: true,
        subtree: false,
        attributes: true,
        attributeFilter: ['class']
    });

    const resizeObserver = new ResizeObserver(() => syncIndicator(false));
    resizeObserver.observe(nav);

    window.addEventListener('resize', () => syncIndicator(false), {passive: true});
    decorateAll();
})();
