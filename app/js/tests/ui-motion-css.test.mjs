import assert from 'node:assert/strict';
import fs from 'node:fs';

const css = fs.readFileSync(
    new URL('../../css/style.css', import.meta.url),
    'utf8'
);
const tabBar = fs.readFileSync(
    new URL('../features/tab-bar.js', import.meta.url),
    'utf8'
);

const requiredSelectors = [
    '.financial-panel tbody tr',
    '.financial-stats .stat',
    '.automation-hero',
    '.automation-stat',
    '.automation-card',
    '.automation-setting',
    '.automation-row',
    '.automation-integration',
    '.automation-retry',
    '.view-tabs .tab-indicator',
    '.view-tab-icon',
    '.view-tab-label'
];

for (const selector of requiredSelectors) {
    assert.ok(css.includes(selector), `missing motion selector: ${selector}`);
}

assert.ok(
    css.includes('@media (hover: hover) and (pointer: fine)'),
    'hover effects must be limited to hover-capable pointers'
);
assert.ok(
    css.includes('@media (prefers-reduced-motion: reduce)'),
    'motion must respect reduced-motion preference'
);
assert.match(
    css,
    /\.automation-stat:hover[\s\S]*translateY\(-4px\)/,
    'automation stat cards should lift on hover'
);
assert.match(
    css,
    /\.financial-stats \.stat:hover[\s\S]*translateY\(-5px\)/,
    'financial stat cards should lift on hover'
);
assert.match(
    css,
    /\.financial-panel tbody tr:hover[\s\S]*translateY\(-2px\)/,
    'financial rows should react subtly on hover'
);
assert.match(
    css,
    /\.automation-setting:hover[\s\S]*translateY\(-2px\)/,
    'automation settings should react on hover'
);

for (
    const id of['dashboardTab', 'studentsTab', 'financialTab', 'reportsTab', 'automationTab']
) {
    assert.ok(tabBar.includes(id), `tab bar must support ${id}`);
}
assert.ok(
    tabBar.includes('ResizeObserver'),
    'indicator should stay aligned after layout changes'
);
assert.ok(
    tabBar.includes('MutationObserver'),
    'dynamic tabs should be decorated when added'
);
assert.ok(
    tabBar.includes('aria-label'),
    'icon-only tabs must keep accessible labels'
);

console.log('ui motion and animated tab bar contract passed');
