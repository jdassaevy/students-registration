(() => {
    const saved = localStorage.getItem('dassaevy-theme');
    document.documentElement.dataset.theme = saved === 'light' ? 'light' : 'dark';
})();
