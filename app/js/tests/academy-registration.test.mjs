import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

const moduleUrl = new URL('../core/academy-onboarding.js', import.meta.url);

function createElement(tagName = 'div') {
    const children = [];
    const attributes = new Map();
    return {
        tagName: tagName.toUpperCase(),
        id: '',
        className: '',
        hidden: false,
        required: false,
        disabled: false,
        value: '',
        textContent: '',
        children,
        classList: {
            values: new Set(),
            add(...names) { names.forEach(name => this.values.add(name)); },
            remove(...names) { names.forEach(name => this.values.delete(name)); },
            contains(name) { return this.values.has(name); }
        },
        setAttribute(name, value) { attributes.set(name, String(value)); },
        getAttribute(name) { return attributes.get(name) ?? null; },
        appendChild(child) { children.push(child); child.parentNode = this; return child; },
        insertBefore(child, reference) {
            const index = children.indexOf(reference);
            if (index < 0) children.push(child); else children.splice(index, 0, child);
            child.parentNode = this;
            return child;
        },
        querySelector(selector) {
            if (selector === 'input') return children.find(child => child.tagName === 'INPUT') || null;
            return null;
        }
    };
}

function harness({ title = 'Entrar na sua conta', academyName = '' } = {}) {
    const form = createElement('form');
    const emailField = createElement('div');
    emailField.id = 'emailField';
    form.appendChild(emailField);
    const authTitle = createElement('h1');
    authTitle.id = 'authTitle';
    authTitle.textContent = title;
    const authSubmit = createElement('button');
    authSubmit.id = 'authSubmit';
    const elements = new Map([
        ['authForm', form],
        ['emailField', emailField],
        ['authTitle', authTitle],
        ['authSubmit', authSubmit]
    ]);

    const observers = [];
    class MutationObserver {
        constructor(callback) { this.callback = callback; observers.push(this); }
        observe() {}
    }

    const document = {
        createElement,
        getElementById(id) { return elements.get(id) || null; }
    };

    const signupCalls = [];
    const authCallbacks = [];
    const client = {
        auth: {
            signUp(payload) { signupCalls.push(payload); return Promise.resolve({ error: null }); },
            onAuthStateChange(callback) { authCallbacks.push(callback); return { data: { subscription: {} } }; }
        }
    };

    const resolveCalls = [];
    const bootstrapCalls = [];
    const AcademyContext = {
        async resolve(db, user) { resolveCalls.push([db, user]); return { academyId: null }; },
        async bootstrap(db, name) { bootstrapCalls.push([db, name]); return 'academy-created'; }
    };

    const context = {
        window: {
            AcademyContext,
            supabase: { createClient: () => client },
            requestAnimationFrame: callback => callback()
        },
        document,
        MutationObserver,
        console: { error() {}, log() {}, warn() {} },
        setTimeout
    };
    context.window.document = document;
    context.window.MutationObserver = MutationObserver;
    vm.createContext(context);

    const source = fs.readFileSync(moduleUrl, 'utf8');
    vm.runInContext(source, context);

    const academyField = form.children.find(child => child.id === 'academyNameField');
    const academyInput = academyField?.children.find(child => child.id === 'academyName');
    if (academyInput) academyInput.value = academyName;

    return { context, form, authTitle, authSubmit, observers, client, signupCalls, authCallbacks, resolveCalls, bootstrapCalls, academyField, academyInput };
}

test('registration field is injected before email and hidden outside register mode', () => {
    const h = harness();
    assert.equal(h.form.children[0].id, 'academyNameField');
    assert.equal(h.form.children[1].id, 'emailField');
    assert.equal(h.academyField.hidden, true);
    assert.equal(h.academyInput.required, false);
    assert.equal(h.academyInput.disabled, true);
});

test('registration field becomes required when register mode is active', () => {
    const h = harness({ title: 'Criar conta da academia' });
    assert.equal(h.academyField.hidden, false);
    assert.equal(h.academyInput.required, true);
    assert.equal(h.academyInput.disabled, false);
    assert.equal(h.academyField.classList.contains('is-entering'), true);
});

test('signUp includes trimmed academy_name metadata', async () => {
    const h = harness({ title: 'Criar conta da academia', academyName: '  Academia Nova  ' });
    const db = h.context.window.supabase.createClient('url', 'key');
    await db.auth.signUp({ email: 'owner@example.com', password: 'secret123' });

    assert.equal(h.signupCalls.length, 1);
    assert.equal(h.signupCalls[0].options.data.academy_name, 'Academia Nova');
});

test('signUp rejects registration without academy name', async () => {
    const h = harness({ title: 'Criar conta da academia', academyName: '   ' });
    const db = h.context.window.supabase.createClient('url', 'key');

    await assert.rejects(
        () => db.auth.signUp({ email: 'owner@example.com', password: 'secret123' }),
        /informe o nome da academia/i
    );
    assert.equal(h.signupCalls.length, 0);
});

test('confirmed user metadata bootstraps academy before core auth callback', async () => {
    const h = harness();
    const db = h.context.window.supabase.createClient('url', 'key');
    const coreEvents = [];
    db.auth.onAuthStateChange((event, session) => coreEvents.push([event, session]));

    const session = { user: { id: 'user-1', user_metadata: { academy_name: 'Academia Nova' } } };
    await h.authCallbacks[0]('SIGNED_IN', session);

    assert.equal(h.resolveCalls.length, 1);
    assert.equal(h.bootstrapCalls.length, 1);
    assert.equal(h.bootstrapCalls[0][1], 'Academia Nova');
    assert.equal(h.context.window.currentAcademyId, 'academy-created');
    assert.equal(coreEvents.length, 1);
});

test('existing academy membership is reused without duplicate bootstrap', async () => {
    const h = harness();
    h.context.window.AcademyContext.resolve = async () => ({ academyId: 'academy-existing' });
    const db = h.context.window.supabase.createClient('url', 'key');
    db.auth.onAuthStateChange(() => {});

    await h.authCallbacks[0]('SIGNED_IN', { user: { id: 'user-1', user_metadata: { academy_name: 'Ignored' } } });

    assert.equal(h.bootstrapCalls.length, 0);
    assert.equal(h.context.window.currentAcademyId, 'academy-existing');
});

test('auth submit mirrors disabled loading state through aria-busy', () => {
    const h = harness();
    assert.equal(h.authSubmit.getAttribute('aria-busy'), 'false');
    h.authSubmit.disabled = true;
    h.observers.forEach(observer => observer.callback());
    assert.equal(h.authSubmit.getAttribute('aria-busy'), 'true');
});

test('academy context failure still forwards auth event to core callback', async () => {
    const h = harness();
    h.context.window.AcademyContext.resolve = async () => { throw new Error('tenant unavailable'); };
    const db = h.context.window.supabase.createClient('url', 'key');
    const coreEvents = [];
    db.auth.onAuthStateChange((event, session) => coreEvents.push([event, session]));

    await h.authCallbacks[0]('SIGNED_IN', { user: { id: 'user-1', user_metadata: {} } });

    assert.equal(h.context.window.currentAcademyId, null);
    assert.equal(coreEvents.length, 1);
    assert.equal(coreEvents[0][0], 'SIGNED_IN');
});
