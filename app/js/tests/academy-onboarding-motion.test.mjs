import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const cssUrl = new URL('../../css/academy-onboarding.css', import.meta.url);
const css = () => fs.readFileSync(cssUrl, 'utf8');

test('academy field uses subtle enter motion without layout-property animation', () => {
    const source = css();
    assert.match(source, /\.academy-name-field\.is-entering/);
    assert.match(source, /opacity/);
    assert.match(source, /transform/);
    assert.match(source, /filter/);
    assert.doesNotMatch(source, /transition[^;]*(?:width|height|top|left|margin|padding)/i);
});

test('auth loading state exposes an indeterminate spinner', () => {
    const source = css();
    assert.match(source, /#authSubmit:disabled::before/);
    assert.match(source, /@keyframes\s+academy-onboarding-spin/);
});

test('academy onboarding motion respects reduced motion preference', () => {
    const source = css();
    assert.match(source, /@media\s*\(prefers-reduced-motion:\s*reduce\)/);
    assert.match(source, /animation-duration:\s*0\.01ms\s*!important/);
});
