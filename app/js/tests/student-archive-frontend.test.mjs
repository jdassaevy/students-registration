import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const script = fs.readFileSync(new URL('../core/script.js', import.meta.url), 'utf8');

test('current student loaders exclude archived rows', () => {
    const activeFilters = script.match(
        /from\(['"]students['"]\)[\s\S]{0,220}?\.is\(['"]archived_at['"],\s*null\)/g
    ) || [];
    assert.ok(
        activeFilters.length >= 2,
        'both initial and post-local-migration student loads must filter archived_at'
    );
});

test('removeCouple uses the archive-aware RPC', () => {
    assert.match(
        script,
        /rpc\(['"]remove_student_from_operation['"],\s*\{\s*p_student_id:\s*id\s*\}\)/
    );
    assert.doesNotMatch(
        script,
        /function removeCouple[\s\S]*?from\(['"]students['"]\)[\s\S]*?\.delete\(\)/
    );
    assert.match(script, /Cadastro removido\. Histórico financeiro preservado\./);
    assert.match(script, /Cadastro excluído\./);
});
