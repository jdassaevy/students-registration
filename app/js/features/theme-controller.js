const THEME_KEY = 'dassaevy-theme';

function normalizeTheme(value) {
  return value === 'dark' || value === 'light' ? value : null;
}

function resolveInitialTheme(storedTheme) {
  return normalizeTheme(storedTheme) || 'dark';
}

function applyTheme(theme) {
  const normalized = normalizeTheme(theme) || 'dark';
  if (typeof document === 'undefined') return normalized;

  document.documentElement.dataset.theme = normalized;
  const meta = document.querySelector('meta[name="theme-color"]');
  if (meta) meta.content = normalized === 'dark' ? '#171312' : '#f6f0e6';

  const button = document.getElementById('themeToggle');
  if (button) {
    button.setAttribute('aria-pressed', String(normalized === 'light'));
    button.setAttribute(
      'aria-label',
      normalized === 'dark' ? 'Ativar tema claro' : 'Ativar tema escuro'
    );
  }
  return normalized;
}

function getTheme() {
  if (typeof document === 'undefined') return 'dark';
  return normalizeTheme(document.documentElement.dataset.theme) || 'dark';
}

function setTheme(theme) {
  const applied = applyTheme(theme);
  if (typeof localStorage !== 'undefined') localStorage.setItem(THEME_KEY, applied);
  return applied;
}

function toggleTheme() {
  return setTheme(getTheme() === 'dark' ? 'light' : 'dark');
}

if (typeof module !== 'undefined' && module.exports) {
  module.exports = {normalizeTheme, resolveInitialTheme};
}

if (typeof window !== 'undefined') {
  window.DassaevyTheme = {getTheme, setTheme, toggleTheme};
  const stored = window.localStorage.getItem(THEME_KEY);
  applyTheme(resolveInitialTheme(stored));
  window.addEventListener('DOMContentLoaded', () => {
    document.getElementById('themeToggle')?.addEventListener('click', toggleTheme);
    applyTheme(getTheme());
  }, {once: true});
}
