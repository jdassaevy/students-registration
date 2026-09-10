import assert from 'node:assert/strict';
import fs from 'node:fs';

const motion = fs.readFileSync(
    new URL('../../css/ui-v2/motion.css', import.meta.url),
    'utf8'
);
const layout = fs.readFileSync(
    new URL('../../css/ui-v2/layout.css', import.meta.url),
    'utf8'
);
const financial = fs.readFileSync(
    new URL('../../css/ui-v2/pages/financial.css', import.meta.url),
    'utf8'
);
const automation = fs.readFileSync(
    new URL('../../css/ui-v2/pages/automation.css', import.meta.url),
    'utf8'
);
const tabBar = fs.readFileSync(
    new URL('../features/tab-bar.js', import.meta.url),
    'utf8'
);

assert.match(
    motion,
    /@media\s*\(prefers-reduced-motion\s*:\s*reduce\)/,
    'UI v2 motion must respect reduced-motion preference'
);
assert.match(
    layout,
    /\.tab-indicator[\s\S]*transition:[\s\S]*transform\s+var\(--motion-normal\)/,
    'navigation indicator must use UI v2 motion tokens'
);
assert.match(
    financial,
    /@media\s*\(hover:\s*hover\)\s*and\s*\(pointer:\s*fine\)/,
    'financial hover effects must be limited to hover-capable pointers'
);
assert.match(
    financial,
    /\.financial-card:hover\s*\{[^}]*transform:\s*translateY\(-1px\)/s,
    'financial cards should use only a subtle lift'
);
for (const selector of ['.automation-setting:hover', '.automation-row:hover', '.automation-retry:hover:not(:disabled)']) {
    assert.ok(automation.includes(selector), `missing UI v2 motion selector: ${selector}`);
}
assert.match(
    automation,
    /\.automation-setting:hover\s*\{[^}]*translateY\(-1px\)/s,
    'automation settings should use a quiet one-pixel lift'
);
assert.match(
    automation,
    /\.automation-row:hover\s*\{[^}]*translateY\(-1px\)/s,
    'automation rows should use a quiet one-pixel lift'
);

for (const id of ['dashboardTab', 'studentsTab', 'classesTab', 'financialTab', 'reportsTab', 'automationTab']) {
    assert.ok(tabBar.includes(id), `tab bar must support ${id}`);
}
assert.ok(tabBar.includes('ResizeObserver'), 'indicator should stay aligned after layout changes');
assert.ok(tabBar.includes('MutationObserver'), 'dynamic tabs should be decorated when added');
assert.ok(tabBar.includes('aria-label'), 'icon-only tabs must keep accessible labels');

console.log('ui v2 motion and animated tab bar contract passed');
