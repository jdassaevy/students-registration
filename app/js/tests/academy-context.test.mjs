import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const AcademyContext = require('../core/academy-context.js');

test('normalizePhone accepts Brazilian mobile and landline numbers', () => {
    assert.equal(AcademyContext.normalizePhone('(48) 99999-9999'), '5548999999999');
    assert.equal(AcademyContext.normalizePhone('48 3333-4444'), '554833334444');
});

test('validateBootstrapPayload rejects missing required data', () => {
    assert.throws(() => AcademyContext.validateBootstrapPayload({academyName: '', responsibleName: 'Professor', phone: '(48) 99999-9999'}), /academia/i);
    assert.throws(() => AcademyContext.validateBootstrapPayload({academyName: 'Academia', responsibleName: '', phone: '(48) 99999-9999'}), /responsável/i);
    assert.throws(() => AcademyContext.validateBootstrapPayload({academyName: 'Academia', responsibleName: 'Professor', phone: '123'}), /telefone/i);
});

test('validateBootstrapPayload returns normalized payload', () => {
    assert.deepEqual(
        AcademyContext.validateBootstrapPayload({academyName: ' Academia Sul ', responsibleName: ' Maria ', phone: '(48) 99999-9999'}),
        {academyName: 'Academia Sul', responsibleName: 'Maria', phone: '5548999999999'}
    );
});

test('active academy starts empty and can be cleared', () => {
    AcademyContext.clear();
    assert.equal(AcademyContext.getActiveAcademyId(), null);
});
