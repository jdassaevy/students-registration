import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const studentsUi = fs.readFileSync(
  new URL('../features/students-ui.js', import.meta.url),
  'utf8'
);

test('mobile students rebind search and class filter after wrapping render', () => {
  const wrapperIndex = studentsUi.indexOf('render = function ()');
  const searchBindingIndex = studentsUi.indexOf("$('search').oninput = render");
  const classBindingIndex = studentsUi.indexOf("$('classFilter').onchange = render");

  assert.ok(wrapperIndex >= 0, 'students UI must wrap the core render');
  assert.ok(
    searchBindingIndex > wrapperIndex,
    'search must be rebound after the mobile render wrapper is installed'
  );
  assert.ok(
    classBindingIndex > wrapperIndex,
    'class filter must be rebound after the mobile render wrapper is installed'
  );
});
