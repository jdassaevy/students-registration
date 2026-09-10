import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const components = fs.readFileSync(new URL('../../css/ui-v2/components.css', import.meta.url), 'utf8');

test('toast is hidden by default and visible only while show class is present', () => {
  assert.match(
    components,
    /\.toast,\s*\n\.ui-toast\s*\{[\s\S]*?opacity:\s*0;[\s\S]*?visibility:\s*hidden;[\s\S]*?pointer-events:\s*none;[\s\S]*?transform:\s*translateY\(8px\);/,
    'toast base state must be visually hidden'
  );

  assert.match(
    components,
    /\.toast\.show,\s*\n\.ui-toast\.show\s*\{[\s\S]*?opacity:\s*1;[\s\S]*?visibility:\s*visible;[\s\S]*?pointer-events:\s*auto;[\s\S]*?transform:\s*translateY\(0\);/,
    'show class must make toast visible'
  );
});
