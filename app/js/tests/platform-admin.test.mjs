import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const source = readFileSync(new URL('../features/platform-admin.js', import.meta.url), 'utf8');

test('platform console is gated by platform_admin role', () => {
    assert.match(source, /platform_admin/);
    assert.match(source, /platformAdminView/);
    assert.match(source, /Acessar academia/);
});

test('support mode is explicit and auditable', () => {
    assert.match(source, /support_access_logs/);
    assert.match(source, /supportModeBanner/);
    assert.match(source, /Sair do modo suporte/);
    assert.match(source, /AcademyContext\.useSupportAcademy/);
});

test('support context exposes enter exit and active academy methods', () => {
    assert.match(source, /SupportContext/);
    assert.match(source, /async function enter/);
    assert.match(source, /async function exit/);
    assert.match(source, /getActiveAcademyId/);
});
