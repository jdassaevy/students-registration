import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const cssUrl = new URL('../../css/academy-profile.css', import.meta.url);
const jsUrl = new URL('../features/academy-profile.js', import.meta.url);

test('academy profile uses real loading skeleton and reduced motion support', () => {
    const css = fs.readFileSync(cssUrl, 'utf8');
    assert.match(css, /academy-profile-skeleton/);
    assert.match(css, /prefers-reduced-motion/);
    assert.match(css, /transform/);
    assert.match(css, /opacity/);
    assert.doesNotMatch(css, /transition[^;]*(width|height|top|left)/i);
});

test('academy profile save exposes busy state and duplicate-submit protection', () => {
    const source = fs.readFileSync(jsUrl, 'utf8');
    assert.match(source, /aria-busy/);
    assert.match(source, /button\.disabled\s*=\s*isSaving/);
    assert.match(source, /academyProfileSave[^\n]*disabled|\.disabled\) return/);
    assert.doesNotMatch(source, /setTimeout\([^)]*setLoading|setTimeout\([^)]*skeleton/i);
});
