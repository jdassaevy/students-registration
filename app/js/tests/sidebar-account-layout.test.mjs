import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const layoutUrl = new URL('../../css/ui-v2/layout.css', import.meta.url);
const layoutCss = () => fs.readFileSync(layoutUrl, 'utf8');

test('sidebar account controls stay in normal footer flow', () => {
  const css = layoutCss();
  const rule = css.match(/\.app-sidebar-footer\s+\.account-bar\s*\{([^}]*)\}/s);

  assert.ok(rule, 'missing sidebar account-bar UI v2 rule');
  assert.match(rule[1], /position:\s*static/);
  assert.match(rule[1], /top:\s*auto/);
  assert.match(rule[1], /right:\s*auto/);
  assert.match(rule[1], /width:\s*100%/);
});
