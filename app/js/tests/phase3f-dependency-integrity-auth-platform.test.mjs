import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const read = path => fs.readFileSync(new URL(path, import.meta.url), 'utf8');
const index = read('../../index.html');
const script = read('../core/script.js');

const SUPABASE_URL = 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.116.0';
const DOCX_URL = 'https://cdn.jsdelivr.net/npm/docx@8.5.0/build/index.umd.js';

function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

test('Supabase browser SDK remains exact-pinned without unverified CDN integrity metadata', () => {
  const tag = index.match(new RegExp(
    `<script[^>]*src=["']${escapeRegExp(SUPABASE_URL)}["'][^>]*><\\/script>`
  ));
  assert.ok(tag, 'Supabase SDK script tag must exist');
  assert.doesNotMatch(tag[0], /\sintegrity=["']/);
  assert.match(tag[0], /crossorigin=["']anonymous["']/);
  assert.match(tag[0], /referrerpolicy=["']no-referrer["']/);
});

test('docx remains exact-version pinned while integrity provenance is unresolved', () => {
  assert.match(index, new RegExp(`src=["']${escapeRegExp(DOCX_URL)}["']`));
  assert.doesNotMatch(index, /docx@(?:latest|8(?:["'\/]))/i);
});

test('client-only Auth flow is explicit and recovery-compatible', () => {
  assert.match(script, /flowType:\s*['"]implicit['"]/);
  assert.match(script, /detectSessionInUrl:\s*true/);
  assert.match(script, /persistSession:\s*true/);
  assert.match(script, /autoRefreshToken:\s*true/);
  assert.doesNotMatch(script, /flowType:\s*['"]pkce['"]/);
});
