import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const css = fs.readFileSync(
    new URL('../../css/ui-v2/pages/onboarding.css', import.meta.url),
    'utf8'
);

test('legacy-account onboarding uses subtle UI v2 transform opacity and blur motion', () => {
    assert.match(css, /\.academy-bootstrap-view[\s\S]*transition:\s*opacity\s+var\(--motion-fast\)\s+ease-out/i);
    assert.match(css, /\.academy-bootstrap-card[\s\S]*opacity:\s*0[\s\S]*transform:\s*translateY\(8px\)[\s\S]*filter:\s*blur\(4px\)/i);
    assert.match(css, /\.academy-bootstrap-card\.is-entering[\s\S]*opacity:\s*1[\s\S]*transform:\s*translateY\(0\)[\s\S]*filter:\s*blur\(0\)/i);
    assert.match(css, /\.academy-bootstrap-card\.is-leaving[\s\S]*translateY\(-4px\)/i);
});

test('legacy-account onboarding submit exposes an indeterminate UI v2 loading indicator', () => {
    assert.match(css, /#academyBootstrapSubmit\[aria-busy="true"\]::before/i);
    assert.match(css, /animation:\s*academy-onboarding-spin\s+700ms\s+linear\s+infinite/i);
});

test('legacy-account onboarding UI v2 motion respects reduced motion', () => {
    assert.match(css, /@media\s*\(prefers-reduced-motion:\s*reduce\)/i);
    assert.match(css, /\.academy-bootstrap-view,[\s\S]*\.academy-bootstrap-card\s*\{[\s\S]*transition-duration:\s*\.01ms\s*!important/i);
    assert.match(css, /#academyBootstrapSubmit\[aria-busy="true"\]::before[\s\S]*animation-duration:\s*\.01ms\s*!important/i);
});
