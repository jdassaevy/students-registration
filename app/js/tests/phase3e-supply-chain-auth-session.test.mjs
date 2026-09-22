import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const read = path => fs.readFileSync(new URL(path, import.meta.url), 'utf8');
const index = read('../../index.html');
const script = read('../core/script.js');
const reports = read('../features/reports.js');
const vercel = JSON.parse(read('../../../vercel.json'));

const SUPABASE_CDN = 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.116.0';
const DOCX_CDN = 'https://cdn.jsdelivr.net/npm/docx@8.5.0/build/index.umd.js';
const CHART_CDN = 'https://cdn.jsdelivr.net/npm/chart.js@4.4.7/dist/chart.umd.min.js';

test('browser dependencies are exact-version pinned', () => {
  assert.match(index, new RegExp(`src=["']${SUPABASE_CDN.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}["']`));
  assert.match(index, new RegExp(`src=["']${DOCX_CDN.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}["']`));
  assert.doesNotMatch(index, /@supabase\/supabase-js@2["']/);
  assert.doesNotMatch(index, /@supabase\/supabase-js@latest/i);
});

test('external scripts do not send the page referrer', () => {
  for (const url of [SUPABASE_CDN, DOCX_CDN]) {
    const escaped = url.replace(/[.*+?^${}()|[\]\\]/g, '\\  for (const url of [SUPABASE_CDN, DOCX_CDN, CHART_CDN]) {
    const escaped = url.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const tag = index.match(new RegExp(`<script[^>]*src=["']${escaped}["'][^>]*><\\/script>`));
    assert.ok(tag, `missing script tag for ${url}`);
    assert.match(tag[0], /crossorigin=["']anonymous["']/);
    assert.match(tag[0], /referrerpolicy=["']no-referrer["']/);
  }');
    const tag = index.match(new RegExp(`<script[^>]*src=["']${escaped}["'][^>]*><\\/script>`));
    assert.ok(tag, `missing script tag for ${url}`);
    assert.match(tag[0], /crossorigin=["']anonymous["']/);
    assert.match(tag[0], /referrerpolicy=["']no-referrer["']/);
  }
  assert.match(reports, /script\.crossOrigin = ['"]anonymous['"]/);
  assert.match(reports, /script\.referrerPolicy = ['"]no-referrer['"]/);
});

test('CSP script-src allows only self and the reviewed CDN files', () => {
  const rule = vercel.headers?.find(item => item.source === '/(.*)');
  assert.ok(rule, 'global header rule must exist');
  const csp = rule.headers.find(item => item.key === 'Content-Security-Policy')?.value || '';
  const match = csp.match(/(?:^|;\s*)script-src\s+([^;]+)/);
  assert.ok(match, 'script-src directive must exist');
  const sources = match[1].trim().split(/\s+/);
  assert.deepEqual(sources, ["'self'", SUPABASE_CDN, DOCX_CDN, CHART_CDN]);
});

test('Supabase browser session behavior is explicit and recovery-compatible', () => {
  assert.match(script, /createClient\([\s\S]*SUPABASE_CONFIG\.publishableKey,[\s\S]*auth:\s*\{/);
  assert.match(script, /autoRefreshToken:\s*true/);
  assert.match(script, /persistSession:\s*true/);
  assert.match(script, /detectSessionInUrl:\s*true/);
});

test('runtime app sources contain no Supabase secret/service-role key markers', () => {
  const runtimeSources = [
    read('../../index.html'),
    read('../core/supabase-config.js'),
    read('../core/script.js'),
  ].join('\n');
  assert.doesNotMatch(runtimeSources, /sb_secret_/i);
  assert.doesNotMatch(runtimeSources, /service[_-]?role/i);
});
