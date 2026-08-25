(() => {
    if (document.getElementById('automationView')) return;
    if (document.querySelector('script[data-automation-center-v2]')) return;

    const script = document.createElement('script');
    script.src = './js/features/automation-center-v2.js?v=1';
    script.dataset.automationCenterV2 = 'true';
    document.body.appendChild(script);
})();
