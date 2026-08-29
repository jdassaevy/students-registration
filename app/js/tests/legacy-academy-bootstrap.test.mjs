import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

const moduleUrl = new URL('../core/academy-onboarding.js', import.meta.url);

function createHarness({ resolvedAcademyId = null, bootstrapError = null } = {}) {
    const elements = new Map();

    function createElement(tagName = 'div') {
        const attributes = new Map();
        const listeners = new Map();
        const element = {
            tagName: tagName.toUpperCase(),
            id: '',
            className: '',
            hidden: false,
            required: false,
            disabled: false,
            value: '',
            textContent: '',
            children: [],
            parentNode: null,
            classList: {
                values: new Set(),
                add(...names) { names.forEach(name => this.values.add(name)); },
                remove(...names) { names.forEach(name => this.values.delete(name)); },
                contains(name) { return this.values.has(name); }
            },
            setAttribute(name, value) { attributes.set(name, String(value)); },
            getAttribute(name) { return attributes.get(name) ?? null; },
            removeAttribute(name) { attributes.delete(name); },
            addEventListener(type, callback) {
                const callbacks = listeners.get(type) || [];
                callbacks.push(callback);
                listeners.set(type, callbacks);
            },
            async trigger(type) {
                const event = {
                    type,
                    target: element,
                    preventDefault() {}
                };
                const callbacks = listeners.get(type) || [];
                for (const callback of callbacks) {
                    await callback(event);
                }
            },
            appendChild(child) {
                this.children.push(child);
                child.parentNode = this;
                registerTree(child);
                return child;
            },
            insertBefore(child, reference) {
                const index = this.children.indexOf(reference);
                if (index < 0) this.children.push(child);
                else this.children.splice(index, 0, child);
                child.parentNode = this;
                registerTree(child);
                return child;
            },
            querySelector(selector) {
                if (selector === 'input') {
                    return this.children.find(child => child.tagName === 'INPUT') || null;
                }
                return null;
            },
            focus() {}
        };
        return element;
    }

    function registerTree(element) {
        if (element.id) elements.set(element.id, element);
        for (const child of element.children || []) registerTree(child);
    }

    const body = createElement('body');
    const authView = createElement('section');
    authView.id = 'authView';
    const authForm = createElement('form');
    authForm.id = 'authForm';
    const emailField = createElement('div');
    emailField.id = 'emailField';
    const authTitle = createElement('h1');
    authTitle.id = 'authTitle';
    authTitle.textContent = 'Entrar na sua conta';
    const authSubmit = createElement('button');
    authSubmit.id = 'authSubmit';
    authSubmit.textContent = 'Entrar';
    const appView = createElement('div');
    appView.id = 'appView';
    appView.hidden = true;

    authForm.appendChild(emailField);
    authForm.appendChild(authSubmit);
    authView.appendChild(authTitle);
    authView.appendChild(authForm);
    body.appendChild(authView);
    body.appendChild(appView);
    registerTree(body);

    const document = {
        body,
        createElement,
        getElementById(id) { return elements.get(id) || null; }
    };

    class MutationObserver {
        constructor(callback) { this.callback = callback; }
        observe() {}
    }

    const authCallbacks = [];
    const client = {
        auth: {
            signUp() { return Promise.resolve({ error: null }); },
            onAuthStateChange(callback) {
                authCallbacks.push(callback);
                return { data: { subscription: {} } };
            }
        }
    };

    const resolveCalls = [];
    const bootstrapCalls = [];
    const AcademyContext = {
        async resolve(db, user) {
            resolveCalls.push([db, user]);
            return { academyId: resolvedAcademyId };
        },
        async bootstrap(db, name) {
            bootstrapCalls.push([db, name]);
            if (bootstrapError) throw bootstrapError;
            return 'academy-created';
        }
    };

    const context = {
        window: {
            AcademyContext,
            supabase: { createClient: () => client },
            requestAnimationFrame: callback => callback(),
            MutationObserver
        },
        document,
        MutationObserver,
        console: { error() {} },
        setTimeout(callback) { callback(); return 1; },
        clearTimeout() {}
    };
    context.window.document = document;
    vm.createContext(context);
    vm.runInContext(fs.readFileSync(moduleUrl, 'utf8'), context);

    return {
        context,
        document,
        client,
        authCallbacks,
        resolveCalls,
        bootstrapCalls
    };
}

const legacySession = {
    user: {
        id: 'legacy-user',
        email: 'legacy@example.com',
        user_metadata: {}
    }
};

test('legacy user without academy is blocked before the core auth callback', async () => {
    const h = createHarness();
    const db = h.context.window.supabase.createClient('url', 'key');
    const coreEvents = [];
    db.auth.onAuthStateChange((event, session) => coreEvents.push([event, session]));

    await h.authCallbacks[0]('SIGNED_IN', legacySession);

    assert.equal(coreEvents.length, 0);
    assert.equal(h.context.window.currentAcademyId, null);
    assert.equal(h.document.getElementById('academyBootstrapView')?.hidden, false);
    assert.equal(h.document.getElementById('academyBootstrapName')?.required, true);
});

test('legacy onboarding is exposed as an accessible modal status flow', async () => {
    const h = createHarness();
    const db = h.context.window.supabase.createClient('url', 'key');
    db.auth.onAuthStateChange(() => {});

    await h.authCallbacks[0]('SIGNED_IN', legacySession);

    const view = h.document.getElementById('academyBootstrapView');
    const message = h.document.getElementById('academyBootstrapMessage');
    assert.equal(view.getAttribute('role'), 'dialog');
    assert.equal(view.getAttribute('aria-modal'), 'true');
    assert.equal(view.getAttribute('aria-labelledby'), 'academyBootstrapTitle');
    assert.equal(message.getAttribute('role'), 'status');
    assert.equal(message.getAttribute('aria-live'), 'polite');
});

test('legacy bootstrap creates academy and releases the original auth event', async () => {
    const h = createHarness();
    const db = h.context.window.supabase.createClient('url', 'key');
    const coreEvents = [];
    db.auth.onAuthStateChange((event, session) => coreEvents.push([event, session]));

    await h.authCallbacks[0]('SIGNED_IN', legacySession);
    const nameInput = h.document.getElementById('academyBootstrapName');
    const form = h.document.getElementById('academyBootstrapForm');
    nameInput.value = '  Academia Legada  ';
    await form.trigger('submit');

    assert.equal(h.bootstrapCalls.length, 1);
    assert.equal(h.bootstrapCalls[0][1], 'Academia Legada');
    assert.equal(h.context.window.currentAcademyId, 'academy-created');
    assert.equal(coreEvents.length, 1);
    assert.equal(coreEvents[0][0], 'SIGNED_IN');
    assert.equal(h.document.getElementById('academyBootstrapView').hidden, true);
});

test('legacy bootstrap exposes real loading state while the rpc is pending', async () => {
    const h = createHarness();
    let releaseBootstrap;
    h.context.window.AcademyContext.bootstrap = () => new Promise(resolve => {
        releaseBootstrap = resolve;
    });
    const db = h.context.window.supabase.createClient('url', 'key');
    db.auth.onAuthStateChange(() => {});

    await h.authCallbacks[0]('SIGNED_IN', legacySession);
    const input = h.document.getElementById('academyBootstrapName');
    const form = h.document.getElementById('academyBootstrapForm');
    const button = h.document.getElementById('academyBootstrapSubmit');
    input.value = 'Academia Legada';

    const pending = form.trigger('submit');
    await Promise.resolve();

    assert.equal(button.disabled, true);
    assert.equal(button.getAttribute('aria-busy'), 'true');
    assert.match(h.document.getElementById('academyBootstrapMessage').textContent, /configurando/i);

    releaseBootstrap('academy-created');
    await pending;
});

test('legacy bootstrap failure keeps onboarding visible and does not release core', async () => {
    const failure = new Error('bootstrap failed');
    const h = createHarness({ bootstrapError: failure });
    const db = h.context.window.supabase.createClient('url', 'key');
    const coreEvents = [];
    db.auth.onAuthStateChange((event, session) => coreEvents.push([event, session]));

    await h.authCallbacks[0]('SIGNED_IN', legacySession);
    h.document.getElementById('academyBootstrapName').value = 'Academia Legada';
    await h.document.getElementById('academyBootstrapForm').trigger('submit');

    assert.equal(coreEvents.length, 0);
    assert.equal(h.document.getElementById('academyBootstrapView').hidden, false);
    assert.equal(h.document.getElementById('academyBootstrapSubmit').disabled, false);
    assert.equal(h.document.getElementById('academyBootstrapSubmit').getAttribute('aria-busy'), 'false');
    assert.match(h.document.getElementById('academyBootstrapMessage').textContent, /não foi possível/i);
});

test('existing academy still bypasses legacy onboarding', async () => {
    const h = createHarness({ resolvedAcademyId: 'academy-existing' });
    const db = h.context.window.supabase.createClient('url', 'key');
    const coreEvents = [];
    db.auth.onAuthStateChange((event, session) => coreEvents.push([event, session]));

    await h.authCallbacks[0]('SIGNED_IN', legacySession);

    assert.equal(h.context.window.currentAcademyId, 'academy-existing');
    assert.equal(coreEvents.length, 1);
    assert.equal(h.document.getElementById('academyBootstrapView')?.hidden ?? true, true);
});
