import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

const sourceUrl = new URL('../features/due-dates.js', import.meta.url);
const source = () => fs.readFileSync(sourceUrl, 'utf8');

test('due dates feature is valid JavaScript and can load in the browser', () => {
    assert.doesNotThrow(
        () => new vm.Script(source(), {filename: 'due-dates.js'}),
        'due-dates.js must stay parseable so its browser hooks can run'
    );
});
