import assert from 'node:assert/strict';
import fs from 'node:fs';

const customSelect = fs.readFileSync(
    new URL('../features/custom-select.js', import.meta.url),
    'utf8'
);
const dashboard = fs.readFileSync(
    new URL('../features/dashboard.js', import.meta.url),
    'utf8'
);
const css = fs.readFileSync(
    new URL('../../css/style.css', import.meta.url),
    'utf8'
) + '\n' + fs.readFileSync(
    new URL('../../css/custom-select-fix.css', import.meta.url),
    'utf8'
);

for (const selector of['select.class-filter', '#coupleClass']) {
    assert.ok(
        customSelect.includes(selector),
        `custom select must enhance ${selector}`
    );
}
assert.ok(
    customSelect.includes('MutationObserver'),
    'custom selects must stay synchronized with dynamic options'
);
assert.ok(
    customSelect.includes("dispatchEvent(new Event('change'"),
    'custom option selection must preserve existing change handlers'
);
assert.ok(
    customSelect.includes('aria-expanded'),
    'custom trigger must expose expanded state'
);
assert.ok(
    customSelect.includes('Escape'),
    'custom dropdown must close with Escape'
);
assert.ok(
    customSelect.includes("closest('.financial-head, .reports-head, .toolbar, .field')"),
    'open dropdown must elevate its container stacking context'
);
assert.match(
    customSelect,
    /classList\s*\.toggle\('custom-select-host-open',\s*open\)/,
    'dropdown state must keep the host elevation synchronized'
);
assert.ok(
    css.includes('.custom-select-menu'),
    'animated dropdown menu styles must exist'
);
assert.ok(
    css.includes('.custom-select-host-open'),
    'open dropdown host must have an elevated z-index'
);
assert.match(
    css,
    /\.custom-select\.is-open \.custom-select-menu[\s\S]*opacity:\s*1/,
    'open dropdown must fade in'
);
assert.match(
    css,
    /\.custom-select\.is-open \.custom-select-menu[\s\S]*translateY\(0\)/,
    'open dropdown must slide into place'
);
assert.ok(
    dashboard.includes('.dashboard-stat-card:hover'),
    'dashboard stat cards need hover motion'
);
assert.ok(
    dashboard.includes('.dashboard-section:hover'),
    'dashboard sections need hover motion'
);
assert.ok(
    dashboard.includes('.dashboard-class-card:hover'),
    'dashboard class cards need hover motion'
);

console.log('custom select stacking and dashboard hover contract passed');
