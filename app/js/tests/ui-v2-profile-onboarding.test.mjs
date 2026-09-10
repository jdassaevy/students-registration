import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const read = path => fs.readFileSync(new URL(path, import.meta.url), 'utf8');
const readOptional = path => {
  const url = new URL(path, import.meta.url);
  return fs.existsSync(url) ? fs.readFileSync(url, 'utf8') : '';
};

const index = read('../../index.html');
const profileCss = readOptional('../../css/ui-v2/pages/profile.css');
const onboardingCss = readOptional('../../css/ui-v2/pages/onboarding.css');
const profileSource = read('../features/academy-profile.js');
const onboardingSource = read('../core/academy-onboarding.js');

test('profile and onboarding move to dedicated UI v2 styles without loading legacy visual sheets', () => {
  assert.match(index, /ui-v2\/pages\/automation\.css[^\n]*[\s\S]*ui-v2\/pages\/profile\.css[^\n]*[\s\S]*ui-v2\/pages\/onboarding\.css/);
  assert.doesNotMatch(index, /href="\.\/css\/academy-profile\.css"/);
  assert.doesNotMatch(index, /href="\.\/css\/academy-onboarding\.css"/);
});

test('academy profile uses semantic theme surfaces, readonly styling, loading skeleton and reduced motion', () => {
  assert.match(profileCss, /\.academy-profile-dialog\s*\{[^}]*background:\s*var\(--surface-elevated\)/s);
  assert.match(profileCss, /\.academy-profile-section\s*\{[^}]*background:\s*var\(--surface-card\)/s);
  assert.match(profileCss, /#academyProfileEmail\[readonly\][^{]*\{[^}]*background:\s*var\(--surface-input\)/s);
  assert.match(profileCss, /academy-profile-skeleton/);
  assert.match(profileCss, /var\(--status-danger\)/);
  assert.match(profileCss, /@media\s*\(prefers-reduced-motion:\s*reduce\)/);
  assert.doesNotMatch(profileCss, /background:\s*(?:#fff|white|rgba\(255\s*,\s*255\s*,\s*255)/i);
});

test('legacy academy onboarding is visually aligned with auth using semantic UI v2 tokens and busy motion', () => {
  assert.match(onboardingCss, /\.academy-bootstrap-view\s*\{[^}]*background:\s*color-mix\([^}]*var\(--surface-page\)/s);
  assert.match(onboardingCss, /\.academy-bootstrap-card\s*\{[^}]*background:\s*var\(--surface-elevated\)/s);
  assert.match(onboardingCss, /#academyBootstrapSubmit\[aria-busy="true"\]::before/);
  assert.match(onboardingCss, /var\(--accent-primary\)/);
  assert.match(onboardingCss, /@media\s*\(prefers-reduced-motion:\s*reduce\)/);
  assert.doesNotMatch(onboardingCss, /var\(--wine|var\(--muted|rgba\(255\s*,\s*253\s*,\s*248/i);
});

test('student and class dialogs have explicit UI v2 polish while profile and onboarding keep current data ownership', () => {
  assert.match(profileCss, /#appView\s+#modal\s*,\s*#appView\s+#classModal\s*\{/s);
  assert.match(profileCss, /#appView\s+#modal\s+\.grid\s*,\s*#appView\s+#classModal\s+\.grid\s*\{[^}]*gap:/s);
  assert.match(profileCss, /@media\s*\(max-width:\s*560px\)[\s\S]*#appView\s+#modal[\s\S]*#appView\s+#classModal/s);

  assert.match(profileSource, /async function load\(\)/);
  assert.match(profileSource, /async function save\(values = \{\}\)/);
  assert.match(profileSource, /activeAcademyId\(\)/);
  assert.match(onboardingSource, /academyContext\.bootstrap/);
  assert.match(onboardingSource, /client\.auth\.signUp/);
});
