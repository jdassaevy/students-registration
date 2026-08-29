# Multi-academy Foundation — Etapa 1

## Objetivo

Introduzir a fundação multi-academia no sistema atual sem alterar funcionalidades que não sejam necessárias para o isolamento de dados.

Esta etapa cobre somente:

- cadastro de uma academia durante a criação da conta;
- vínculo do usuário autenticado à academia;
- definição do usuário criador como `owner`;
- associação de turmas, alunos, pagamentos e recibos à academia;
- isolamento completo entre academias por Row Level Security (RLS);
- preservação temporária dos campos `user_id` existentes para permitir transição segura e rollback.

Ficam explicitamente fora desta etapa:

- Meu Perfil;
- logo da academia;
- painel administrativo da Dassaevy Labs;
- modo suporte;
- assinatura/plano;
- novos papéis além de `owner`;
- alterações nas automações de WhatsApp além das estritamente necessárias para manter compatibilidade;
- remoção dos campos legados `user_id`.

## Princípio de domínio

A academia é a entidade principal do domínio. Usuários pertencem a academias por meio de uma tabela de associação.

Relação conceitual:

```text
Academia
   │
   ├── academy_members
   │      └── Usuários
   │
   ├── Turmas
   ├── Alunos
   ├── Pagamentos
   └── Recibos
```

Relação técnica entre autenticação e academia:

```text
auth.users ── academy_members ── academies
```

## Estrutura de dados

### `academies`

Tabela mínima para representar a academia nesta etapa.

Campos:

- `id uuid primary key default gen_random_uuid()`
- `name text not null`
- `created_at timestamptz not null default now()`
- `updated_at timestamptz not null default now()`

Nenhum campo de logo, plano, contato administrativo ou suporte será introduzido nesta etapa.

### `academy_members`

Tabela de associação entre usuários autenticados e academias.

Campos:

- `academy_id uuid not null references academies(id)`
- `user_id uuid not null references auth.users(id)`
- `role text not null` com valor permitido inicialmente apenas `owner`
- `is_active boolean not null default true`
- `created_at timestamptz not null default now()`
- chave primária composta por `(academy_id, user_id)`

A estrutura usa tabela de associação desde já para permitir que, no futuro, uma academia tenha mais de um usuário sem uma nova remodelagem do banco.

## Associação dos dados à academia

Adicionar `academy_id` de forma aditiva às tabelas existentes:

- `classes`
- `students`
- `payment_events`
- `receipts`

Os campos `user_id` atuais serão mantidos nesta etapa.

A regra de propriedade dos dados passa gradualmente de usuário para academia. O frontend e as policies novas usarão `academy_id` como limite de tenant, enquanto `user_id` permanecerá apenas como compatibilidade temporária.

## Cadastro de nova conta

A tela de registro atual receberá apenas um novo campo obrigatório: `Nome da academia`.

O fluxo será:

1. Usuário informa nome da academia, e-mail e senha.
2. Supabase Auth cria a conta e envia a confirmação de e-mail como já ocorre hoje.
3. O nome da academia é preservado de forma segura até o primeiro login confirmado.
4. Após autenticação confirmada, uma função transacional de bootstrap cria a academia se o usuário ainda não possuir vínculo.
5. A mesma transação cria `academy_members` com o usuário como `owner`.
6. Dados legados do mesmo `user_id`, se existirem e ainda estiverem sem `academy_id`, são associados à nova academia.
7. O sistema carrega os dados da academia ativa.

O bootstrap precisa ser idempotente: repetir a chamada não pode criar academias duplicadas para o mesmo usuário.

## Contas existentes

Usuários já existentes na `main` não podem perder turmas, alunos, pagamentos ou recibos.

Para uma conta antiga sem vínculo em `academy_members`:

- no primeiro login após a atualização, o sistema deve solicitar o nome da academia antes de liberar o app;
- após informar o nome, o bootstrap cria a academia e o vínculo `owner`;
- todos os registros existentes daquele `user_id` que ainda tenham `academy_id is null` são vinculados à academia criada;
- nenhuma linha existente é apagada ou recriada.

A antiga tabela `academy_profiles` permanece intacta nesta etapa. Ela não será usada como fonte de autorização do tenant e não será removida.

## Resolução da academia ativa

Nesta etapa cada usuário comum terá uma única academia ativa.

Após o login, o frontend resolve a academia por `academy_members.user_id = auth.uid()` e `is_active = true`.

Se não existir vínculo, o usuário entra no fluxo de bootstrap de academia.

Se existir exatamente um vínculo, o `academy_id` encontrado vira o contexto ativo da sessão.

Suporte a múltiplas academias por usuário fica fora desta etapa.

## RLS e isolamento

O isolamento deve ser garantido pelo PostgreSQL/Supabase, nunca apenas por filtros no JavaScript.

Criar uma função auxiliar `is_academy_member(target_academy uuid)` que verifica se `auth.uid()` possui vínculo ativo com a academia.

As policies de `classes`, `students`, `payment_events` e `receipts` devem permitir leitura e escrita somente quando:

```sql
is_academy_member(academy_id)
```

Inserções também devem exigir que o `academy_id` informado pertença ao usuário autenticado.

Objetivo de segurança: mesmo conhecendo diretamente o UUID de uma turma, aluno, pagamento ou recibo de outra academia, o usuário não consegue ler, alterar ou excluir o registro.

## Preenchimento de `academy_id`

Novos registros devem receber o `academy_id` ativo sem depender de o usuário digitá-lo.

Preferência de implementação: o frontend envia explicitamente o `academy_id` resolvido da sessão e o banco valida esse valor pelas policies RLS. Isso mantém o comportamento visível e testável sem adicionar triggers desnecessárias nesta primeira etapa.

Registros legados recebem `academy_id` somente durante o bootstrap da conta existente.

## Compatibilidade e rollback

A migração será aditiva.

Não remover:

- `user_id` de tabelas atuais;
- policies antigas antes de as novas estarem validadas em ambiente de teste;
- `academy_profiles`;
- dados legados.

O rollout deve permitir retorno ao frontend da `main` sem perda de dados caso a Etapa 1 falhe.

## Alterações previstas no frontend

Alterações mínimas:

- adicionar `Nome da academia` ao modo de registro;
- armazenar temporariamente o nome necessário para o bootstrap após confirmação de e-mail;
- adicionar um pequeno fluxo de criação de academia para usuários legados sem vínculo;
- resolver e manter `currentAcademyId` após login;
- incluir `academy_id` em inserts de turmas e alunos executados pelo frontend;
- manter a interface principal visualmente igual nesta etapa.

Não adicionar novas abas ou painéis.

## Testes obrigatórios

### Cadastro novo

- criar conta A com Academia A;
- confirmar e-mail e entrar;
- validar uma linha em `academies`;
- validar vínculo em `academy_members` com `role = 'owner'`;
- criar turma e aluno e confirmar `academy_id` correto.

### Conta legada

- entrar com usuário existente que possui dados e não possui `academy_members`;
- informar nome da academia;
- confirmar que os registros antigos mantêm seus IDs e recebem `academy_id`;
- confirmar que contagens e valores financeiros não mudaram.

### Isolamento A/B

Criar Academia A e Academia B.

- A pode consultar e modificar dados de A;
- B pode consultar e modificar dados de B;
- A não pode selecionar dados de B por consulta normal;
- A não pode acessar um registro de B usando UUID conhecido;
- A não pode atualizar nem excluir registro de B;
- A não pode inserir registro usando o `academy_id` de B;
- repetir os mesmos testes no sentido B → A.

### Regressão

Após o bootstrap:

- login e logout continuam funcionando;
- recuperação de senha continua funcionando;
- criação de turma continua funcionando;
- cadastro/edição de aluno continua funcionando;
- financeiro continua carregando;
- geração de lista DOCX continua funcionando;
- pagamentos e recibos existentes continuam acessíveis ao dono correto.

## Critério de conclusão da Etapa 1

A Etapa 1 só poderá ser integrada à `main` quando:

- cadastro novo criar academia e vínculo corretamente;
- conta legada migrar sem perda de registros;
- `academy_id` estiver presente nos novos dados;
- isolamento A/B estiver comprovado pelo RLS;
- funcionalidades atuais da `main` continuarem operando;
- nenhuma funcionalidade fora do escopo tiver sido introduzida.
