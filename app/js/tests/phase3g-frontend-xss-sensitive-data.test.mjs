import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const read = path => fs.readFileSync(new URL(path, import.meta.url), 'utf8');
const core = read('../core/script.js');
const students = read('../features/students-ui.js');
const reports = read('../features/reports.js');
const automation = read('../features/automation-center.js');
const index = read('../../index.html');
const vercel = JSON.parse(read('../../../vercel.json'));

const CHART_URL = 'https://cdn.jsdelivr.net/npm/chart.js@4.4.7/dist/chart.umd.min.js';

test('student actions use delegated handlers instead of inline event attributes', () => {
  const renderedStudentSources = core + '\n' + students;
  assert.doesNotMatch(renderedStudentSources, /\son(?:click|change|submit|input|keydown|load|error)=["']/i);
  assert.match(renderedStudentSources, /data-student-action=["']toggle-month["']/);
  assert.match(renderedStudentSources, /data-student-action=["']toggle-entry["']/);
  assert.match(renderedStudentSources, /data-student-action=["']edit["']/);
  assert.match(renderedStudentSources, /data-student-action=["']remove["']/);
  assert.match(core, /document\.addEventListener\(['"]click['"][\s\S]*data-student-action/);
});

test('Chart.js lazy loader stays exact-pinned and admitted by the exact CSP path', () => {
  assert.equal(index.includes(CHART_URL), false);
  assert.equal(reports.includes(CHART_URL), true);
  assert.match(reports, /createElement\(['"]script['"]\)/);
  assert.match(reports, /script\.src = CHART_SCRIPT_URL/);
  assert.match(reports, /script\.crossOrigin = ['"]anonymous['"]/);
  assert.match(reports, /script\.referrerPolicy = ['"]no-referrer['"]/);
  const rule = vercel.headers?.find(item => item.source === '/(.*)');
  const csp = rule?.headers?.find(item => item.key === 'Content-Security-Policy')?.value || '';
  assert.equal(csp.includes(CHART_URL), true);
});

test('legacy local student/class data is purged only after migration is known complete', () => {
  assert.match(core, /function clearLegacyLocalData\(\)[\s\S]*removeItem\(LOCAL_CLASSES_KEY\)[\s\S]*removeItem\(LOCAL_COUPLES_KEY\)/);
  assert.match(core, /if \(localStorage\.getItem\(flag\)\) \{[\s\S]*clearLegacyLocalData\(\);[\s\S]*return;/);
  assert.match(core, /localStorage\.setItem\(flag, ['"]true['"]\)[\s\S]*clearLegacyLocalData\(\);/);
  assert.ok((core.match(/clearLegacyLocalData\(\);/g) || []).length >= 3);
});

test('database-backed display names remain HTML-escaped at critical render sinks', () => {
  assert.match(core, /escapeHtml\(c\.person1\)/);
  assert.match(core, /escapeHtml\(c\.person2\)/);
  assert.match(students, /escapeHtml\(couple\.person1\)/);
  assert.match(students, /escapeHtml\(classItem\.name\)/);
  assert.match(automation, /safeText\(studentNameFor\(message\)\)/);
});
