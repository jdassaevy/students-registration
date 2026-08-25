(function (root) {
  function parseMoney(value) {
    if (value == null) return 0;
    let text = String(value).trim().replace(/\s/g, '').replace(/^R\$/i, '');
    if (!text) return 0;

    const comma = text.lastIndexOf(',');
    const dot = text.lastIndexOf('.');
    if (comma > -1 && dot > -1) {
      if (comma > dot) text = text.replace(/\./g, '').replace(',', '.');
      else text = text.replace(/,/g, '');
    } else if (comma > -1) {
      text = text.replace(/\./g, '').replace(',', '.');
    } else {
      text = text.replace(/[^0-9.-]/g, '');
    }

    const number = Number(text);
    if (!Number.isFinite(number) || number < 0) return 0;
    return Math.round((number + Number.EPSILON) * 100) / 100;
  }

  function normalizeMoneyText(value) {
    return parseMoney(value).toFixed(2).replace('.', ',');
  }

  function enhanceMoneyInput(input) {
    if (!input || input.dataset.moneyEnhanced === 'true') return;
    input.dataset.moneyEnhanced = 'true';
    input.type = 'text';
    input.inputMode = 'decimal';
    input.autocomplete = 'off';
    input.spellcheck = false;
    input.addEventListener('wheel', () => {
      if (document.activeElement === input) input.blur();
    }, {passive: true});
    input.addEventListener('blur', () => {
      if (input.value.trim()) input.value = normalizeMoneyText(input.value);
    });
  }

  const api = {parseMoney, normalizeMoneyText, enhanceMoneyInput};
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  root.MoneyInput = api;

  if (!root.document) return;
  const ids = ['p1EntryValue','p1MonthlyValue','p2EntryValue','p2MonthlyValue'];
  const inputs = () => ids.map(id => document.getElementById(id)).filter(Boolean);
  const apply = () => inputs().forEach(enhanceMoneyInput);

  document.addEventListener('submit', event => {
    if (event.target?.id !== 'form') return;
    inputs().forEach(input => {
      input.value = String(parseMoney(input.value));
    });
  }, true);

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', apply, {once:true});
  else apply();
})(typeof window !== 'undefined' ? window : globalThis);
