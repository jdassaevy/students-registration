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

test('render updates mobile student cards with every current record action', () => {
  assert.match(core, /function studentCardMarkup\(/);
  assert.match(core, /\$\(['"]studentCards['"]\)\.innerHTML/);
  assert.match(core, /studentCardMarkup/);
  assert.match(core, /editCouple\('/);
  assert.match(core, /removeCouple\('/);
  assert.match(core, /toggleEntry\('/);
  assert.match(core, /toggleMonth\('/);
});

test('students initial loading mirrors desktop rows and mobile cards', () => {
  assert.match(core, /function renderStudentsLoading\(/);
  assert.match(core, /students-loading-row/);
  assert.match(core, /student-card-skeleton/);
  assert.match(core, /renderStudentsLoading\(\);[\s\S]*Promise\.all/s);
});

test('mobile students layout swaps the desktop table for record cards', () => {
  assert.match(css, /@media[^\{]*max-width:\s*768px[\s\S]*\.students-table-wrap[\s\S]*display:\s*none/s);
  assert.match(css, /@media[^\{]*max-width:\s*768px[\s\S]*\.student-cards[\s\S]*display:\s*grid/s);
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
