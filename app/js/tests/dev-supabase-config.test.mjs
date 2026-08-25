import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const config = await readFile(new URL('../core/supabase-config.js', import.meta.url), 'utf8');

test('multi-academy branch points to development Supabase project', () => {
  assert.match(config, /https:\/\/lulvvkrrysfmiqtefwnf\.supabase\.co/);
  assert.match(config, /sb_publishable_ePxmJIkapB3AFctwbvrs2A_fe2DwoOk/);
  assert.doesNotMatch(config, /gswcruzlvkcoclbcrjvp/);
});
