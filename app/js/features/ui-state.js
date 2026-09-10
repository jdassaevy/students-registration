function normalizeProgress(value) {
  return Math.max(0, Math.min(100, Number(value) || 0));
}

function setButtonState(button, state, {loadingText, successText, errorText} = {}) {
  if (!button) return;

  button.dataset.defaultLabel ||= button.textContent;
  button.classList.remove('is-loading', 'is-success', 'is-error');
  button.removeAttribute('aria-busy');

  if (state === 'loading') {
    button.classList.add('is-loading');
    button.setAttribute('aria-busy', 'true');
    button.disabled = true;
    if (loadingText) button.textContent = loadingText;
    return;
  }

  button.disabled = false;

  if (state === 'success') {
    button.classList.add('is-success');
    button.textContent = successText || button.dataset.defaultLabel;
    return;
  }

  if (state === 'error') {
    button.classList.add('is-error');
    button.textContent = errorText || button.dataset.defaultLabel;
    return;
  }

  button.textContent = button.dataset.defaultLabel;
}

function setProgress(element, value) {
  if (!element) return;
  const normalized = normalizeProgress(value);
  element.style.setProperty('--progress', `${normalized}%`);
  element.setAttribute('aria-valuenow', String(normalized));
}

function setLoadingState(container, loading) {
  if (!container) return;
  const active = Boolean(loading);
  container.classList.toggle('is-loading', active);
  container.setAttribute('aria-busy', String(active));
}

if (typeof module !== 'undefined' && module.exports) {
  module.exports = {normalizeProgress};
}

if (typeof window !== 'undefined') {
  window.DassaevyUI = {setButtonState, setProgress, setLoadingState};
}
