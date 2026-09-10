import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

const read = path => fs.readFileSync(new URL(path, import.meta.url), 'utf8');
const readMaybe = path => {
  try {
    return read(path);
  } catch {
    return '';
  }
};

const index = read('../../index.html');
const core = read('../core/script.js');
const tabBar = read('../features/tab-bar.js');
const classesUi = readMaybe('../features/classes-ui.js');
const css = readMaybe('../../css/ui-v2/pages/classes.css');

test('classes presentation is browser-parseable and does not take ownership of academy data', () => {
  assert.ok(classesUi.length > 0, 'classes-ui.js must exist');
  assert.doesNotThrow(() => new vm.Script(classesUi, {filename: 'classes-ui.js'}));
  assert.doesNotMatch(classesUi, /\b(?:db|supabase)\s*\.\s*from\s*\(/);
  assert.doesNotMatch(classesUi, /createClient\s*\(/);
  assert.match(core, /\bclasses\s*=\s*classResult[\s\S]*\.map\(fromClass\)/);
  assert.match(core, /\bcouples\s*=\s*studentResult[\s\S]*\.map\(fromStudent\)/);
});

test('classes becomes a dedicated view between students and financial navigation', () => {
  assert.match(classesUi, /id=["']classesView["']/);
  assert.match(classesUi, /id=["']classesTab["']/);
  assert.match(classesUi, /setView\s*=\s*function\s*\(view\)/);
  assert.match(classesUi, /view\s*!==\s*["']classes["']/);
  assert.match(tabBar, /classesTab\s*:\s*\{/);

  const automationScript = index.indexOf('./js/features/automation-center.js');
  const classesScript = index.indexOf('./js/features/classes-ui.js');
  const tabBarScript = index.indexOf('./js/features/tab-bar.js');
  assert.ok(classesScript > automationScript, 'classes UI must wrap the final existing setView chain');
  assert.ok(classesScript < tabBarScript, 'classes tab must exist before tab bar decoration');
});

test('classes view exposes the approved summary, cards and existing class actions', () => {
  for (const id of ['classesTotal', 'classesStudents', 'classesAverage', 'classesUnassigned', 'classesGrid', 'classesNewBtn']) {
    assert.match(classesUi, new RegExp(`id=["']${id}["']`));
  }

  assert.match(classesUi, /data-class-view-students/);
  assert.match(classesUi, /data-class-export/);
  assert.match(classesUi, /data-delete-class/);
  assert.match(classesUi, /newClassBtn/);
  assert.match(classesUi, /exportSelectedClass\s*\(/);
  assert.match(classesUi, /removeClass\s*\(/);

  assert.match(core, /async function exportSelectedClass\s*\(/);
  assert.match(core, /async function removeClass\s*\(/);
  assert.match(core, /\$\(['"]classForm['"]\)\.addEventListener\(['"]submit['"]/);
});

test('classes presentation refreshes from the existing render lifecycle and provides first-load skeletons', () => {
  assert.match(classesUi, /const originalRender = render/);
  assert.match(classesUi, /render\s*=\s*function\s*\(\)/);
  assert.match(classesUi, /renderClasses\s*\(/);
  assert.match(classesUi, /classesSkeleton/);
  assert.match(classesUi, /classesContent/);
  assert.match(classesUi, /aria-busy/);
  assert.match(classesUi, /ui-skeleton/);
});

test('classes owns a semantic responsive UI v2 stylesheet', () => {
  const studentsCss = index.indexOf('./css/ui-v2/pages/students.css');
  const classesCss = index.indexOf('./css/ui-v2/pages/classes.css');
  const financialCss = index.indexOf('./css/ui-v2/pages/financial.css');
  assert.ok(classesCss > studentsCss, 'classes.css must load after students.css');
  assert.ok(classesCss < financialCss, 'classes.css must load before financial.css');

  assert.match(css, /var\(--surface-card\)/);
  assert.match(css, /var\(--surface-elevated\)/);
  assert.match(css, /var\(--text-primary\)/);
  assert.match(css, /var\(--accent-primary\)/);
  assert.match(css, /\.classes-skeleton/);
  assert.match(css, /\.classes-grid/);
  assert.match(css, /@media[^\{]*max-width:\s*768px/s);
  assert.match(css, /prefers-reduced-motion:\s*reduce/);
  assert.doesNotMatch(css, /background:\s*(?:#fff(?:fff)?|white)\b/i);
});
