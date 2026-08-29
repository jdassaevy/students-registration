# Multi-academy Foundation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Introduzir cadastro de academia, vínculo owner e isolamento completo por `academy_id` sem alterar as demais funcionalidades da `main`.

**Architecture:** A migração será aditiva: `academies` e `academy_members` passam a definir o tenant, enquanto `user_id` e `academy_profiles` permanecem temporariamente para rollback. O frontend resolve um único `currentAcademyId` após login e o envia nos novos registros; o PostgreSQL valida toda leitura e escrita por RLS.

**Tech Stack:** HTML, JavaScript vanilla, Supabase Auth, PostgreSQL/RLS, Node.js `node:test` para testes de contrato.

**Spec:** `docs/superpowers/specs/2026-08-29-multi-academy-foundation-design.md`

## Global Constraints

- Escopo limitado a cadastro da academia, vínculo do usuário e isolamento de dados.
- Manter `user_id` e `academy_profiles` intactos nesta etapa.
- Não adicionar Meu Perfil, logo, painel Dassaevy Labs, modo suporte, assinatura ou novos papéis além de `owner`.
- Cada usuário comum terá uma única academia ativa nesta etapa.
- RLS é a autoridade de isolamento; filtros JavaScript não contam como barreira de segurança.
- Nenhuma linha legada pode ser apagada ou recriada durante bootstrap.

---

### Task 1: Fundação SQL aditiva e contrato de isolamento

**Files:**
- Create: `supabase/migrations/20260829112000_multi_academy_foundation.sql`
- Create: `app/js/tests/multi-academy-schema.test.mjs`

**Interfaces:**
- Produces: tabelas `public.academies`, `public.academy_members`; função `public.is_academy_member(uuid) -> boolean`; função `public.bootstrap_academy(text) -> uuid`; coluna `academy_id` em `classes`, `students`, `payment_events`, `receipts`.

- [ ] **Step 1: Write the failing schema contract test**

Criar teste Node que leia a migration como texto e exija explicitamente: `academies`, `academy_members`, `academy_id` nas quatro tabelas, `is_academy_member`, `bootstrap_academy`, `role = 'owner'`, policies por `academy_id` e ausência de `drop column user_id`/`drop table academy_profiles`.

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test app/js/tests/multi-academy-schema.test.mjs`
Expected: FAIL porque a migration ainda não existe.

- [ ] **Step 3: Implement the additive migration**

A migration deve:
1. criar `academies(id, name, created_at, updated_at)`;
2. criar `academy_members(academy_id, user_id, role, is_active, created_at)` com PK composta e `role` restrito a `owner` nesta etapa;
3. adicionar `academy_id` nullable às quatro tabelas existentes e índices correspondentes;
4. criar `is_academy_member(target_academy uuid)` como `security definer`, validando `auth.uid()`, `academy_id` e `is_active = true`;
5. criar `bootstrap_academy(academy_name text)` transacional e idempotente: se já houver vínculo ativo retorna o `academy_id`; caso contrário cria academia + owner e atualiza apenas linhas do usuário atual cujo `academy_id is null`;
6. habilitar RLS nas novas tabelas;
7. permitir ao usuário ler sua associação e sua academia;
8. substituir as policies das quatro tabelas de domínio por policies baseadas em `is_academy_member(academy_id)` para SELECT/INSERT/UPDATE/DELETE;
9. preservar fisicamente `user_id` e `academy_profiles`.

- [ ] **Step 4: Run the schema contract test**

Run: `node --test app/js/tests/multi-academy-schema.test.mjs`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add supabase/migrations/20260829112000_multi_academy_foundation.sql app/js/tests/multi-academy-schema.test.mjs
git commit -m "feat: add multi-academy tenant foundation"
```

### Task 2: Contexto de academia no frontend

**Files:**
- Create: `app/js/core/academy-context.js`
- Create: `app/js/tests/academy-context.test.mjs`
- Modify: `app/index.html`

**Interfaces:**
- Produces: `window.AcademyContext.resolve(db, user) -> Promise<{ academyId: string|null }>`; `window.AcademyContext.bootstrap(db, academyName) -> Promise<string>`.
- Consumes: RPC `bootstrap_academy(text)` e tabela `academy_members` da Task 1.

- [ ] **Step 1: Write failing context tests**

Testar com doubles de Supabase que `resolve` consulta `academy_members` pelo usuário ativo e retorna um único `academy_id`; ausência de vínculo retorna `null`; `bootstrap` chama RPC `bootstrap_academy` e retorna UUID.

- [ ] **Step 2: Verify failure**

Run: `node --test app/js/tests/academy-context.test.mjs`
Expected: FAIL porque `academy-context.js` ainda não existe.

- [ ] **Step 3: Implement minimal academy context**

Implementar módulo browser sem dependências externas, expondo apenas `resolve` e `bootstrap`. Não armazenar autorização em `localStorage`; o `academyId` fica apenas no estado da sessão JS.

- [ ] **Step 4: Load module before `script.js`**

Em `app/index.html`, incluir `./js/core/academy-context.js` imediatamente antes de `./js/core/script.js`.

- [ ] **Step 5: Run tests**

Run: `node --test app/js/tests/academy-context.test.mjs app/js/tests/index-integrity.test.mjs`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add app/js/core/academy-context.js app/js/tests/academy-context.test.mjs app/index.html
git commit -m "feat: resolve active academy context"
```

### Task 3: Cadastro novo com nome da academia

**Files:**
- Modify: `app/index.html`
- Modify: `app/js/core/script.js`
- Create: `app/js/tests/academy-registration.test.mjs`

**Interfaces:**
- Consumes: `AcademyContext.bootstrap(db, academyName)` da Task 2.
- Produces: metadata de signup `academy_name`; `currentAcademyId` resolvido após confirmação/login.

- [ ] **Step 1: Write failing registration contract test**

Exigir que o HTML tenha `#academyNameField`/`#academyName`, que o campo apareça apenas em `register`, e que `signUp` envie `options.data.academy_name` junto com email/senha.

- [ ] **Step 2: Verify failure**

Run: `node --test app/js/tests/academy-registration.test.mjs`
Expected: FAIL.

- [ ] **Step 3: Add the registration field**

Adicionar campo obrigatório `Nome da academia` antes do e-mail. `setAuthMode()` deve exibi-lo e torná-lo obrigatório somente no modo `register`.

- [ ] **Step 4: Preserve academy name through email confirmation**

No `signUp`, enviar:

```js
await db.auth.signUp({
  email,
  password,
  options: { data: { academy_name: academyName } }
});
```

Após sessão autenticada sem vínculo, ler `currentUser.user_metadata.academy_name`; se houver nome válido, chamar `AcademyContext.bootstrap` automaticamente.

- [ ] **Step 5: Run focused and existing auth/index tests**

Run: `node --test app/js/tests/academy-registration.test.mjs app/js/tests/index-integrity.test.mjs`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add app/index.html app/js/core/script.js app/js/tests/academy-registration.test.mjs
git commit -m "feat: create academy during account onboarding"
```

### Task 4: Bootstrap explícito para contas legadas

**Files:**
- Modify: `app/index.html`
- Modify: `app/js/core/script.js`
- Create: `app/js/tests/legacy-academy-bootstrap.test.mjs`

**Interfaces:**
- Consumes: `AcademyContext.resolve` e `AcademyContext.bootstrap`.
- Produces: bloqueio simples de onboarding para usuário autenticado sem academia e sem `academy_name` em metadata.

- [ ] **Step 1: Write failing legacy bootstrap contract test**

Exigir uma pequena view/dialog com input de nome da academia e garantir que `showApp()` só ocorra depois de `currentAcademyId` existir.

- [ ] **Step 2: Verify failure**

Run: `node --test app/js/tests/legacy-academy-bootstrap.test.mjs`
Expected: FAIL.

- [ ] **Step 3: Implement legacy onboarding**

Ao autenticar:
1. chamar `AcademyContext.resolve`;
2. se retornar UUID, definir `currentAcademyId` e seguir;
3. se retornar `null` e houver `user_metadata.academy_name`, executar bootstrap automático;
4. se retornar `null` sem metadata, mostrar apenas o formulário de nome da academia;
5. ao salvar, executar `bootstrap`, definir `currentAcademyId`, esconder onboarding e liberar o app.

Não criar nova aba nem página de perfil.

- [ ] **Step 4: Run tests**

Run: `node --test app/js/tests/legacy-academy-bootstrap.test.mjs app/js/tests/academy-context.test.mjs`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add app/index.html app/js/core/script.js app/js/tests/legacy-academy-bootstrap.test.mjs
git commit -m "feat: bootstrap academy for legacy accounts"
```

### Task 5: Escritas e leituras no contexto da academia

**Files:**
- Modify: `app/js/core/script.js`
- Create: `app/js/tests/academy-data-context.test.mjs`

**Interfaces:**
- Consumes: `currentAcademyId: string` definido no fluxo de autenticação.
- Produces: todos os inserts frontend de `classes` e `students` com `academy_id: currentAcademyId`; leituras filtradas explicitamente por `.eq('academy_id', currentAcademyId)` como defesa adicional, sem substituir RLS.

- [ ] **Step 1: Write failing data-context test**

Cobrir `loadData`, criação de turma, criação/edição de aluno e migração local, exigindo `academy_id` no payload/filtro pertinente.

- [ ] **Step 2: Verify failure**

Run: `node --test app/js/tests/academy-data-context.test.mjs`
Expected: FAIL.

- [ ] **Step 3: Update data operations minimally**

Adicionar `.eq('academy_id', currentAcademyId)` nas consultas de turmas/alunos e `academy_id: currentAcademyId` nos inserts. Não alterar renderização, financeiro ou DOCX.

- [ ] **Step 4: Run focused regression tests**

Run: `node --test app/js/tests/academy-data-context.test.mjs app/js/tests/index-integrity.test.mjs app/js/tests/money-input.test.js`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add app/js/core/script.js app/js/tests/academy-data-context.test.mjs
git commit -m "feat: scope app data to active academy"
```

### Task 6: Validar isolamento e regressão antes de qualquer merge

**Files:**
- Create: `docs/multi-academy-stage-1-validation.md`

**Interfaces:**
- Consumes: implementação das Tasks 1–5.
- Produces: checklist reproduzível de validação manual em Supabase/preview.

- [ ] **Step 1: Run every repository Node test**

Run: `node --test app/js/tests/*.test.js app/js/tests/*.test.mjs`
Expected: todos PASS.

- [ ] **Step 2: Validate new account A**

Criar Academia A, confirmar e-mail, entrar, criar turma e aluno. Conferir no banco: uma academia, um `academy_members` owner e `academy_id` correto nos registros.

- [ ] **Step 3: Validate legacy account**

Usar uma conta existente com dados. Informar nome da academia no bootstrap e comparar IDs, contagens e valores antes/depois; nenhum registro pode ser apagado ou recriado.

- [ ] **Step 4: Validate A/B isolation**

Com Academia A e Academia B, testar SELECT/UPDATE/DELETE por UUID conhecido da outra academia e INSERT usando `academy_id` alheio. Todos devem ser negados/ocultados pelo RLS. Repetir B → A.

- [ ] **Step 5: Validate regression surface**

Testar login/logout, recuperação de senha, turma, aluno, financeiro, DOCX, pagamentos e recibos. Não validar novas funções fora do escopo porque elas não devem existir nesta branch.

- [ ] **Step 6: Record results and commit**

Preencher `docs/multi-academy-stage-1-validation.md` com data, ambiente, contas de teste anonimizadas e PASS/FAIL de cada caso.

```bash
git add docs/multi-academy-stage-1-validation.md
git commit -m "test: document multi-academy stage 1 validation"
```

## Merge Gate

Não fazer merge na `main` enquanto qualquer item abaixo estiver pendente:

- testes automatizados verdes;
- cadastro novo cria academia + owner;
- conta legada mantém todos os dados e IDs;
- isolamento A/B comprovado no banco;
- regressões da `main` testadas;
- branch contém somente mudanças da Etapa 1.
