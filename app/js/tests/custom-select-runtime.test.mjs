import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

const scriptUrl = new URL('../features/custom-select.js', import.meta.url);
const source = () => fs.readFileSync(scriptUrl, 'utf8');

test('custom select feature is valid JavaScript and can load in the browser', () => {
  assert.doesNotThrow(() => new vm.Script(source(), { filename: 'custom-select.js' }));
});

test('custom select enhancer includes the couple class field', () => {
  assert.match(source(), /#coupleClass/);
});
