import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const motionUrl = new URL('../../css/ui-v2/motion.css', import.meta.url);
const motion = () => fs.readFileSync(motionUrl, 'utf8');

test('final motion layer preserves the custom select vertical reveal transition', () => {
    const source = motion();
    assert.match(
        source,
        /#appView\s+\.custom-select-menu[\s\S]*?transition:[\s\S]*?clip-path\s+var\(--motion-normal\)\s+var\(--motion-ease\)/,
        'motion.css must animate clip-path instead of overriding the vertical reveal from components.css'
    );
});
