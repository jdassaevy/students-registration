# Multi-Academy Platform Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Transformar o Students Registration em uma plataforma SaaS multi-academia com perfil do professor responsável, isolamento por academia, conta administrativa da Dassaevy Labs, modo suporte e base preparada para múltiplos professores e cobrança futura.

**Architecture:** A academia passa a ser o tenant principal. `profiles` representa identidade do usuário, `academies` representa o cliente, `academy_members` vincula usuários a academias e todas as tabelas operacionais recebem `academy_id`. A migração será incremental para preservar os dados atuais e permitir rollback antes da troca definitiva das políticas RLS.

**Tech Stack:** HTML/CSS/JavaScript sem framework, Supabase Auth, PostgreSQL/Supabase RLS, Supabase Storage, jsPDF, Node.js para testes de contrato.

**Spec:** `docs/superpowers/specs/2026-08-25-multi-academy-platform-design.md`

## Global Constraints

- Cadastro público cria somente usuário comum + academia + membro `owner`; nunca `platform_admin`.
- Telefone/WhatsApp é obrigatório no cadastro do professor responsável.
- Dados oficiais de recibos e mensagens vêm da academia.
- Usuários antigos devem migrar sem perder turmas, alunos, pagamentos ou recibos.
- Estrutura aceita `teacher`, mas não haverá interface para adicionar professores nesta versão.
- `platform_admin` só pode ser concedido pelo backend.
- Modo suporte deve ser explícito e auditado.
- Senhas nunca são armazenadas nem expostas pelas tabelas da aplicação.
- RLS final deve isolar dados por `academy_id` e permitir acesso administrativo somente através das regras definidas para `platform_admin`/modo suporte.
- `academy_profiles` permanece como legado durante esta entrega e não será apagada.
- Cobrança, checkout, portal do aluno e frequência ficam fora desta entrega.

---

### Task 1: Fundação multi-academia no banco

**Files:**
- Create: `app/database/multi-academy-migration.sql`
- Modify: `app/database/supabase-schema.sql`
- Create: `app/js/tests/multi-academy-schema.test.mjs`

**Interfaces:**
- Produces: tabelas `profiles`, `academies`, `academy_members`, `support_access_logs`; coluna `academy_id` nas tabelas operacionais; helpers SQL de autorização.

- [ ] **Step 1: Escrever teste de contrato que exige as novas tabelas e colunas**

O teste deve ler os SQLs e verificar literalmente `create table if not exists public.profiles`, `public.academies`, `public.academy_members`, `public.support_access_logs` e `add column if not exists academy_id uuid` para `classes`, `students`, `payment_events` e `receipts`.

- [ ] **Step 2: Executar o teste e confirmar falha**

Run: `node --test app/js/tests/multi-academy-schema.test.mjs`
Expected: FAIL porque as estruturas ainda não existem.

- [ ] **Step 3: Criar migration aditiva**

Implementar tabelas conforme a spec, índices por `academy_id`, timestamps e constraints de papéis. Não remover `user_id` nem `academy_profiles`.

- [ ] **Step 4: Adicionar helpers SQL de autorização**

Criar funções `public.is_platform_admin()`, `public.is_academy_member(target_academy uuid)` e `public.is_academy_owner(target_academy uuid)` como `security definer`, `stable`, com `search_path` fixo.

- [ ] **Step 5: Executar teste novamente**

Run: `node --test app/js/tests/multi-academy-schema.test.mjs`
Expected: PASS.

- [ ] **Step 6: Commit**

`git commit -am "feat: add multi-academy database foundation"`

### Task 2: Bootstrap seguro de nova academia e migração de usuário antigo

**Files:**
- Modify: `app/database/multi-academy-migration.sql`
- Create: `app/js/core/academy-context.js`
- Create: `app/js/tests/academy-context.test.mjs`

**Interfaces:**
- Produces JS: `AcademyContext.resolve(user)`, `AcademyContext.bootstrap(payload)`, `AcademyContext.getActiveAcademyId()`.
- Produces SQL RPC: `bootstrap_academy(academy_name text, responsible_name text, contact_phone text)` retornando `academy_id uuid`.

- [ ] **Step 1: Testar normalização/validação do payload**

Cobrir nome de academia vazio, responsável vazio, telefone inválido e payload válido.

- [ ] **Step 2: Confirmar falha do teste**

Run: `node --test app/js/tests/academy-context.test.mjs`
Expected: FAIL.

- [ ] **Step 3: Implementar RPC transacional e idempotente**

A RPC deve reutilizar vínculo existente se houver; caso contrário criar `profiles`, `academies`, `academy_members(role='owner')`, migrar registros do `user_id` atual para `academy_id`, e retornar a academia. Nunca aceitar papel administrativo como parâmetro.

- [ ] **Step 4: Implementar módulo JS de contexto**

`resolve()` consulta membro ativo; `bootstrap()` chama a RPC; `getActiveAcademyId()` retorna somente academia já resolvida. Não usar `localStorage` como fonte de autorização.

- [ ] **Step 5: Rodar testes**

Run: `node --test app/js/tests/academy-context.test.mjs`
Expected: PASS.

- [ ] **Step 6: Commit**

`git commit -am "feat: add academy bootstrap and migration context"`

### Task 3: Novo cadastro e tela de completar perfil

**Files:**
- Modify: `app/index.html`
- Modify: `app/js/core/script.js`
- Modify: `app/css/style.css`
- Create: `app/js/features/profile-onboarding.js`
- Create: `app/js/tests/profile-onboarding.test.mjs`

**Interfaces:**
- Consumes: `AcademyContext.bootstrap()` e `AcademyContext.resolve()`.
- Produces: formulário público com academia, professor, WhatsApp, e-mail, senha e confirmação; onboarding bloqueante para usuários legados.

- [ ] **Step 1: Criar testes de contrato do formulário**

Exigir campos `signupAcademyName`, `signupResponsibleName`, `signupPhone`, `signupEmail`, `signupPassword`, `signupPasswordConfirm` e modal `profileOnboardingModal`.

- [ ] **Step 2: Confirmar falha**

Run: `node --test app/js/tests/profile-onboarding.test.mjs`
Expected: FAIL.

- [ ] **Step 3: Atualizar cadastro**

Salvar academia/responsável/telefone em `user_metadata` apenas como dados temporários de onboarding; após confirmação e login, chamar `bootstrap_academy`.

- [ ] **Step 4: Implementar onboarding legado**

Se `AcademyContext.resolve()` não encontrar vínculo, bloquear a aplicação e pedir Nome da academia, Nome do professor e WhatsApp. E-mail vem da sessão e não é editado.

- [ ] **Step 5: Rodar testes de autenticação/UI existentes e novos**

Run: `node --test app/js/tests/*.test.mjs`
Expected: PASS.

- [ ] **Step 6: Commit**

`git commit -am "feat: add academy onboarding to signup"`

### Task 4: Migrar operações do frontend para `academy_id`

**Files:**
- Modify: `app/js/core/script.js`
- Modify: `app/js/features/dashboard.js`
- Modify: `app/js/features/reports.js`
- Modify: `app/js/features/financial-details.js`
- Modify: `app/js/features/payment-automation.js`
- Modify: `app/js/features/receipts.js`
- Modify: `app/js/features/automation-center.js`
- Create: `app/js/tests/academy-data-scope.test.mjs`

**Interfaces:**
- Consumes: `AcademyContext.getActiveAcademyId()`.
- Produces: todas as queries operacionais filtradas/inseridas com `academy_id`.

- [ ] **Step 1: Criar teste de contrato contra queries dependentes apenas de `currentUser.id`**

O teste deve falhar enquanto operações de turmas/alunos/pagamentos/recibos continuarem usando `user_id` como tenant principal.

- [ ] **Step 2: Confirmar falha**

Run: `node --test app/js/tests/academy-data-scope.test.mjs`
Expected: FAIL.

- [ ] **Step 3: Migrar leitura e escrita módulo a módulo**

Toda criação inclui `academy_id`; toda leitura/alteração usa a academia ativa. `user_id` permanece quando necessário para autoria/auditoria, mas não determina o tenant.

- [ ] **Step 4: Rodar suíte completa**

Run: `node --test app/js/tests/*.test.mjs app/js/tests/*.test.js`
Expected: PASS.

- [ ] **Step 5: Commit**

`git commit -am "refactor: scope application data by academy"`

### Task 5: RLS multi-academia e testes de isolamento

**Files:**
- Modify: `app/database/multi-academy-migration.sql`
- Modify: `app/database/supabase-schema.sql`
- Modify: `app/js/tests/multi-academy-schema.test.mjs`

**Interfaces:**
- Consumes: `is_platform_admin`, `is_academy_member`, `is_academy_owner`.
- Produces: policies finais para `classes`, `students`, `payment_events`, `receipts`, `academies`, `academy_members`, `profiles` e `support_access_logs`.

- [ ] **Step 1: Expandir teste para exigir policies por academia**

Verificar que as policies operacionais referenciam `academy_id` e helpers de membership, e que atualização de `platform_role` não é concedida a usuário comum.

- [ ] **Step 2: Confirmar falha**

Run: `node --test app/js/tests/multi-academy-schema.test.mjs`
Expected: FAIL.

- [ ] **Step 3: Implementar policies**

Membros ativos acessam somente sua academia. Owner pode editar academia. `platform_admin` pode listar academias e operar somente através do contexto administrativo previsto. `support_access_logs` aceita inserts do próprio admin e não é editável por professores.

- [ ] **Step 4: Validar SQL em projeto de desenvolvimento antes da produção**

Executar migration no Supabase de desenvolvimento e testar com dois usuários reais de teste: Academia A não lê UUIDs da Academia B; Academia B não lê A; admin lista ambas.

- [ ] **Step 5: Commit**

`git commit -am "security: enforce academy tenant isolation"`

### Task 6: Meu Perfil e logo da academia

**Files:**
- Create: `app/js/features/profile.js`
- Modify: `app/index.html`
- Modify: `app/css/style.css`
- Modify: `app/database/multi-academy-migration.sql`
- Create: `app/js/tests/profile.test.mjs`

**Interfaces:**
- Produces: aba `Meu Perfil`; bucket/storage policy `academy-logos`; atualização de academia e perfil; alteração de senha via Supabase Auth.

- [ ] **Step 1: Criar testes de contrato da UI**

Exigir seções Academia, Professor responsável e Segurança, input de logo e ações substituir/remover.

- [ ] **Step 2: Confirmar falha**

Run: `node --test app/js/tests/profile.test.mjs`
Expected: FAIL.

- [ ] **Step 3: Implementar dados da academia e responsável**

Owner edita nome, contato oficial e logo; nome/telefone pessoal ficam em `profiles`; e-mail de login fica somente leitura nesta versão.

- [ ] **Step 4: Implementar Storage**

Salvar logo em caminho `${academyId}/logo.<ext>` com policy que permite escrita somente ao owner daquela academia e leitura autenticada necessária à aplicação.

- [ ] **Step 5: Implementar alteração de senha**

Reautenticar com e-mail + senha atual; somente depois chamar atualização para nova senha. Confirmar nova senha no frontend antes da chamada.

- [ ] **Step 6: Rodar testes**

Run: `node --test app/js/tests/profile.test.mjs app/js/tests/index-integrity.test.mjs`
Expected: PASS.

- [ ] **Step 7: Commit**

`git commit -am "feat: add academy and owner profile"`

### Task 7: Recibos e mensagens usam identidade oficial da academia

**Files:**
- Modify: `app/js/features/receipts.js`
- Modify: `app/js/features/payment-automation.js`
- Modify: `app/js/features/automation-center.js`
- Modify: `app/js/tests/receipts.test.js`
- Modify: `app/js/tests/reminders.test.mjs`

**Interfaces:**
- Consumes: academia ativa com `name`, `contact_phone`, `contact_email`, `logo_path`.
- Produces: PDF e mensagens com identidade oficial centralizada.

- [ ] **Step 1: Atualizar testes para identidade da academia**

Exigir nome, contato e logo quando disponível; garantir fallback sem logo.

- [ ] **Step 2: Confirmar falha**

Run: `node --test app/js/tests/receipts.test.js app/js/tests/reminders.test.mjs`
Expected: FAIL.

- [ ] **Step 3: Substituir leitura de `academy_profiles`**

Recibos e mensagens passam a buscar `academies` pela academia ativa. Não usar telefone de professor secundário.

- [ ] **Step 4: Rodar testes**

Run: `node --test app/js/tests/receipts.test.js app/js/tests/reminders.test.mjs`
Expected: PASS.

- [ ] **Step 5: Commit**

`git commit -am "feat: use academy identity in receipts and messages"`

### Task 8: Painel Dassaevy Labs e modo suporte

**Files:**
- Create: `app/js/features/platform-admin.js`
- Modify: `app/index.html`
- Modify: `app/css/style.css`
- Modify: `app/database/multi-academy-migration.sql`
- Create: `app/js/tests/platform-admin.test.mjs`

**Interfaces:**
- Consumes: `profiles.platform_role`, `academies`, `support_access_logs`.
- Produces: Painel Dassaevy Labs; `SupportContext.enter(academyId, reason)`, `SupportContext.exit()`, banner de modo suporte.

- [ ] **Step 1: Criar testes de contrato do painel**

Exigir que painel só seja montado para `platform_admin`, tenha lista de academias, ação “Acessar academia”, banner e “Sair do modo suporte”.

- [ ] **Step 2: Confirmar falha**

Run: `node --test app/js/tests/platform-admin.test.mjs`
Expected: FAIL.

- [ ] **Step 3: Implementar painel e contexto**

Admin lista academias e entra explicitamente em uma. `enter()` registra `support_access_logs.started_at`; `exit()` encerra o log com `ended_at` e limpa a academia de suporte.

- [ ] **Step 4: Bloquear operações sensíveis**

Modo suporte não oferece alteração da senha/e-mail de autenticação do professor. A UI exibe permanentemente qual academia está sendo acessada.

- [ ] **Step 5: Rodar testes**

Run: `node --test app/js/tests/platform-admin.test.mjs`
Expected: PASS.

- [ ] **Step 6: Commit**

`git commit -am "feat: add Dassaevy Labs support console"`

### Task 9: Compatibilidade, migração e validação final

**Files:**
- Modify: `README.md`
- Modify: `app/database/multi-academy-migration.sql`
- Modify: testes afetados em `app/js/tests/`

**Interfaces:**
- Produces: checklist de rollout e rollback; documentação para promoção manual de `platform_admin`.

- [ ] **Step 1: Rodar suíte completa antes do rollout**

Run: `node --test app/js/tests/*.test.mjs app/js/tests/*.test.js`
Expected: todos PASS.

- [ ] **Step 2: Testar matriz manual em ambiente de desenvolvimento**

Casos obrigatórios: novo professor cria academia; usuário legado completa perfil e mantém dados; Academia A não vê B; alteração de perfil reflete em recibo; logo aparece no PDF; professor não acessa painel Dassaevy Labs; admin acessa A e B; modo suporte gera log; admin sai do modo suporte; alteração de senha do próprio professor funciona.

- [ ] **Step 3: Documentar rollout**

Ordem: backup do banco; executar migration aditiva; publicar frontend; migrar uma conta de teste legada; validar isolamento; promover manualmente a conta Dassaevy Labs; somente então liberar para demais contas.

- [ ] **Step 4: Documentar rollback**

Enquanto `user_id` e `academy_profiles` forem preservados, rollback consiste em voltar o frontend para a release anterior e restaurar policies anteriores; novas tabelas não precisam ser apagadas imediatamente.

- [ ] **Step 5: Commit**

`git commit -am "docs: add multi-academy rollout procedure"`

## Self-review

- Spec coverage: cadastro, migração, perfil, logo, isolamento, múltiplos professores futuros, admin, suporte, recibos/mensagens e cobrança futura estrutural estão cobertos.
- Scope: cobrança real, convites, portal do aluno e frequência permanecem explicitamente fora.
- Segurança: privilégios administrativos não dependem de campos controláveis pelo frontend; RLS é o limite de segurança.
- Migração: `user_id` e `academy_profiles` permanecem durante a transição para permitir rollback.
- Testabilidade: cada etapa possui teste automatizado ou validação explícita de banco quando o comportamento depende de RLS/Auth real.
