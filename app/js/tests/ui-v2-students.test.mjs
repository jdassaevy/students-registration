import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

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
const studentsUi = readMaybe('../features/students-ui.js');
const css = readMaybe('../../css/ui-v2/pages/students.css');

test('students keeps current functional targets and adds the mobile cards surface', () => {
  assert.match(index, /id=["']studentsView["']/);
  assert.match(index, /id=["']search["']/);
  assert.match(index, /id=["']classFilter["']/);
  assert.match(index, /id=["']exportClassBtn["']/);
  assert.match(index, /id=["']newClassBtn["']/);
  assert.match(index, /id=["']newBtn["']/);
  assert.match(index, /id=["']list["']/);
  assert.match(index, /id=["']studentCards["']/);
  assert.match(index, /students-page-head/);
  assert.match(index, /students-table-wrap/);
});

test('students presentation mirrors current record actions without replacing core handlers', () => {
  assert.match(studentsUi, /function studentCardMarkup\(/);
  assert.match(studentsUi, /\$\(['"]studentCards['"]\)\.innerHTML/);
  assert.match(studentsUi, /studentCardMarkup/);
  assert.match(studentsUi, /editCouple\('/);
  assert.match(studentsUi, /removeCouple\('/);
  assert.match(studentsUi, /toggleEntry\('/);
  assert.match(studentsUi, /toggleMonth\('/);
  assert.match(core, /function editCouple\(/);
  assert.match(core, /async function removeCouple\(/);
  assert.match(core, /async function toggleEntry\(/);
  assert.match(core, /async function toggleMonth\(/);
});

test('students initial loading mirrors desktop rows and mobile cards without changing data queries', () => {
  assert.match(studentsUi, /function renderStudentsLoading\(/);
  assert.match(studentsUi, /students-loading-row/);
  assert.match(studentsUi, /student-card-skeleton/);
  assert.match(studentsUi, /MutationObserver/);
  assert.match(studentsUi, /loading-state/);
  assert.match(core, /Promise\.all\(\[[\s\S]*\.from\(['"]classes['"]\)[\s\S]*\.from\(['"]students['"]\)/s);
});

test('students UI module loads after core and before dashboard wrappers', () => {
  const coreIndex = index.indexOf('./js/core/script.js');
  const studentsIndex = index.indexOf('./js/features/students-ui.js');
  const dashboardIndex = index.indexOf('./js/features/dashboard.js');
  assert.ok(studentsIndex > coreIndex, 'students UI must load after core');
  assert.ok(studentsIndex < dashboardIndex, 'students UI must wrap render before dashboard');
});

test('mobile students layout swaps the desktop table for record cards', () => {
  assert.match(css, /@media[^\{]*max-width:\s*768px[\s\S]*\.students-table-wrap[\s\S]*display:\s*none/s);
  assert.match(css, /@media[^\{]*max-width:\s*768px[\s\S]*\.student-cards[\s\S]*display:\s*grid/s);
});

test('students search uses a geometry-built magnifier instead of a font glyph', () => {
  assert.match(css, /\.students-toolbar \.search::before\s*\{[^}]*content:\s*["']{2}[^}]*width:\s*14px[^}]*height:\s*14px[^}]*border:\s*2px\s+solid\s+var\(--text-muted\)[^}]*border-radius:\s*50%[^}]*top:\s*50%[^}]*transform:\s*translateY\(-50%\)/s);
  assert.match(css, /\.students-toolbar \.search::after\s*\{[^}]*content:\s*["']{2}[^}]*width:\s*6px[^}]*height:\s*2px[^}]*top:\s*50%[^}]*transform:\s*translateY\(4px\)\s+rotate\(45deg\)/s);
});

test('students counters suppress the legacy white diagonal glare', () => {
  assert.match(css, /\.students-stats \.stat::after\s*\{[^}]*content:\s*none/s);
});

test('students page owns a semantic UI v2 visual layer loaded after the dashboard page', () => {
  const dashboard = index.indexOf('./css/ui-v2/pages/dashboard.css');
  const students = index.indexOf('./css/ui-v2/pages/students.css');
  assert.ok(students >= 0, 'students.css must be loaded');
  assert.ok(students > dashboard, 'students.css must load after dashboard.css');
  assert.match(css, /var\(--surface-card\)/);
  assert.match(css, /var\(--accent-primary\)/);
  assert.doesNotMatch(css, /background:\s*(?:#fff(?:fff)?|white)\b/i);
});
