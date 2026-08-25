# Rollout multi-academia

Este documento descreve a publicação segura da arquitetura multi-academia. **Não executar diretamente em produção sem backup e validação em ambiente de desenvolvimento/staging.**

## Pré-requisitos

- CI da branch verde.
- Backup recente do banco de produção.
- Edge Functions atuais exportadas/versionadas.
- Uma conta de teste legada com turmas, alunos, pagamentos e recibos conhecidos.
- Duas contas de teste independentes para validar isolamento entre academias.

## Ordem das migrations

Aplicar exatamente nesta ordem, após as migrations já existentes do projeto:

1. `20260825180500_multi_academy_foundation.sql`
2. `20260825180600_multi_academy_support_profile.sql`
3. `20260825180700_multi_academy_legacy_bridge.sql`
4. `20260825180800_multi_academy_automation.sql`
5. `20260825180900_academy_logo_storage.sql`
6. `20260825181000_multi_academy_receipts_storage.sql`

A primeira migration é aditiva: mantém `user_id` e `academy_profiles` para permitir transição e rollback do frontend.

## Edge Functions a publicar

Depois das migrations e antes do frontend:

- `payment-lifecycle`
- `payment-receipt`
- `process-reminders`
- `retry-automation-message`
- `send-whatsapp`

As funções compartilham `supabase/functions/_shared/tenant.ts`. Publicar o código da branch como uma unidade para não misturar funções antigas baseadas em `user_id` com o novo banco baseado em `academy_id`.

## Validação antes do frontend

1. Entrar com uma conta de teste existente.
2. Executar o fluxo **Complete seu perfil**.
3. Confirmar a criação de uma linha em `profiles`, `academies` e `academy_members` com `role = 'owner'`.
4. Confirmar que `classes`, `students`, `payment_events` e `receipts` anteriores receberam o mesmo `academy_id`.
5. Confirmar que nenhuma contagem de registros da conta mudou.
6. Confirmar que automações e configurações antigas foram vinculadas à academia.

## Teste obrigatório de isolamento

Usar duas academias de teste, A e B.

- Usuário A consegue ler e editar apenas dados de A.
- Usuário A não consegue consultar por UUID uma turma, aluno, pagamento ou recibo de B.
- Usuário B não consegue consultar dados de A.
- Upload/leitura de logo respeita o `academy_id` da pasta.
- PDFs de recibo são lidos apenas por membros da academia ou por suporte auditado.
- As configurações e o histórico de automações ficam separados por `academy_id`.

Qualquer falha nesse bloco impede o rollout.

## Criar a conta Dassaevy Labs

O cadastro público nunca cria `platform_admin`. Depois de criar/identificar a conta interna da Dassaevy Labs, promover manualmente pelo backend usando o UUID real do usuário:

```sql
update public.profiles
set platform_role = 'platform_admin',
    subscription_exempt = true,
    updated_at = now()
where user_id = '<DASSAEVY_LABS_USER_UUID>'::uuid;
```

Não armazenar o UUID administrativo no frontend.

## Teste do modo suporte

1. Entrar com a conta `platform_admin`.
2. Confirmar que o Painel Dassaevy Labs lista as academias.
3. Clicar em **Acessar academia**.
4. Confirmar a criação de `support_access_logs` com `ended_at = null`.
5. Confirmar o banner permanente de modo suporte.
6. Visualizar e editar dados operacionais da academia.
7. Abrir **Meu Perfil** e confirmar que a senha do professor não pode ser alterada pelo suporte.
8. Sair do modo suporte.
9. Confirmar que `ended_at` foi preenchido e que o acesso à academia deixa de funcionar.

## Publicação do frontend

Somente após os passos anteriores:

1. Publicar o frontend da branch.
2. Testar login de usuário legado.
3. Testar cadastro de um professor novo com Nome da academia, Professor responsável, WhatsApp, E-mail e Senha.
4. Testar **Meu Perfil**, alteração de senha e logo.
5. Criar turma e aluno.
6. Marcar pagamento, gerar recibo e validar nome, contato e logo da academia.
7. Abrir Central de Automações e confirmar que preferências/histórico são da academia ativa.

## Rollback

Enquanto `user_id` e `academy_profiles` forem preservados:

1. Interromper novas publicações.
2. Reverter o frontend para a release anterior.
3. Reverter as Edge Functions para as versões anteriores caso o problema esteja no backend.
4. Restaurar as policies anteriores apenas se o problema estiver nas novas regras RLS.
5. Não apagar imediatamente `profiles`, `academies`, `academy_members` ou `academy_id`; manter os dados para diagnóstico e eventual nova tentativa.
6. Se houver corrupção de dados, restaurar o backup do banco em vez de tentar reconstruir relações manualmente.

## Gate final de produção

A atualização só pode ir para produção quando todos forem verdadeiros:

- CI verde.
- Migration testada fora de produção.
- Conta legada migrada sem perda.
- Isolamento A/B validado.
- Recibo e logo validados.
- Painel Dassaevy Labs validado.
- Modo suporte gera e encerra log corretamente.
- Rollback conhecido e backup disponível.
