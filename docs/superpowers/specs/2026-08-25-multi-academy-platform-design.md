# Arquitetura Multi-Academia da Dassaevy Labs

## Objetivo

Transformar o sistema atual em uma base SaaS multi-academia, mantendo a experiência simples para professores e preparando o produto para suporte administrativo da Dassaevy Labs, múltiplos professores por academia no futuro, cobrança recorrente futura e isolamento rigoroso de dados entre clientes.

## Escopo aprovado

Esta versão inclui:

- cadastro público de professores;
- criação automática de uma academia no cadastro;
- perfil do professor responsável;
- dados oficiais da academia usados em recibos e mensagens;
- telefone/WhatsApp obrigatório no cadastro;
- logo personalizada da academia;
- aba Meu Perfil com edição de dados da academia, responsável e senha;
- migração segura das contas antigas sem perda de dados;
- estrutura de banco pronta para múltiplos professores, mas sem interface para adicioná-los nesta versão;
- conta administrativa exclusiva da Dassaevy Labs (`platform_admin`), criada somente no backend;
- Painel Dassaevy Labs separado;
- modo suporte para acessar uma academia com registro de auditoria;
- preparação de campos para cobrança futura, incluindo isenção da conta Dassaevy Labs;
- RLS baseada em academia, não apenas em usuário.

Fora do escopo desta versão:

- cobrança real;
- planos e checkout;
- convites para professores adicionais;
- portal do aluno;
- frequência/chamada;
- permissões finas por turma para professores secundários.

## Modelo conceitual

A academia passa a ser a unidade principal de isolamento. Usuários são membros de uma academia; turmas, alunos, eventos de pagamento, recibos, automações e configurações pertencem à academia.

```text
Dassaevy Labs
  └── platform_admin
       └── Painel Dassaevy Labs
            ├── Academia A
            │    ├── Professor responsável
            │    ├── Turmas
            │    ├── Alunos
            │    ├── Financeiro
            │    └── Automações
            └── Academia B
                 └── ...
```

No futuro, uma academia poderá ter vários professores sem alterar o modelo:

```text
Academia
  ├── owner / professor responsável
  ├── teacher
  ├── teacher
  └── dados compartilhados da academia
```

## Papéis

### `platform_admin`

Conta interna da Dassaevy Labs. Não pode ser criada pelo cadastro público. Deve ser atribuída exclusivamente no backend.

Permissões:

- listar academias;
- visualizar dados operacionais das academias;
- iniciar modo suporte;
- editar turmas, alunos, pagamentos e configurações da academia durante suporte;
- visualizar estado de assinatura futuramente;
- permanecer isenta de cobrança.

Restrições:

- nunca visualizar senha de professor;
- nunca alterar senha de professor em nome dele;
- todo acesso a uma academia deve ser explícito e auditado.

### `owner`

Professor responsável que cria a academia. É o administrador da própria academia.

Permissões desta versão:

- gerenciar dados da academia;
- gerenciar turmas;
- gerenciar alunos;
- gerenciar financeiro;
- gerenciar automações;
- alterar os próprios dados e senha;
- alterar logo, nome e contato oficial da academia.

### `teacher`

Papel reservado para uso futuro. A tabela e as políticas devem aceitar o conceito, mas nenhuma interface para criação/convite será implementada nesta versão.

## Banco de dados

### `profiles`

Perfil de autenticação do usuário.

Campos propostos:

- `user_id uuid primary key references auth.users(id)`;
- `full_name text not null`;
- `phone text not null`;
- `platform_role text not null default 'user' check (platform_role in ('user','platform_admin'))`;
- `subscription_exempt boolean not null default false`;
- `created_at timestamptz not null default now()`;
- `updated_at timestamptz not null default now()`.

`platform_role` não será gravável pelo usuário autenticado comum. A promoção para `platform_admin` será feita apenas com credencial administrativa/backend.

### `academies`

Identidade oficial do cliente.

Campos propostos:

- `id uuid primary key default gen_random_uuid()`;
- `name text not null`;
- `contact_email text not null`;
- `contact_phone text not null`;
- `logo_path text`;
- `subscription_status text not null default 'active'`;
- `created_at timestamptz not null default now()`;
- `updated_at timestamptz not null default now()`.

Nesta versão, `subscription_status` é apenas estrutural. Não haverá bloqueio por cobrança.

### `academy_members`

Vínculo entre usuários e academias.

Campos propostos:

- `academy_id uuid not null references academies(id) on delete cascade`;
- `user_id uuid not null references auth.users(id) on delete cascade`;
- `role text not null check (role in ('owner','teacher'))`;
- `is_active boolean not null default true`;
- `created_at timestamptz not null default now()`;
- chave primária composta `(academy_id, user_id)`.

Nesta versão, o fluxo público cria exatamente um membro `owner` por nova academia.

### `support_access_logs`

Auditoria de acessos administrativos.

Campos propostos:

- `id uuid primary key default gen_random_uuid()`;
- `admin_user_id uuid not null references auth.users(id)`;
- `academy_id uuid not null references academies(id)`;
- `started_at timestamptz not null default now()`;
- `ended_at timestamptz`;
- `reason text`;
- `metadata jsonb not null default '{}'::jsonb`.

A interface exibirá claramente quando o sistema estiver em modo suporte.

## Migração das tabelas atuais

Hoje `classes`, `students`, `payment_events`, `receipts` e `academy_profiles` são isolados por `user_id`. A migração introduzirá `academy_id` sem remover o vínculo antigo de imediato.

Estratégia em duas etapas:

1. adicionar `academy_id` nullable às tabelas existentes;
2. criar uma academia para cada usuário existente após ele completar o perfil;
3. vincular todos os registros atuais daquele `user_id` à nova `academy_id`;
4. validar que nenhum registro ficou sem academia;
5. trocar as políticas RLS para `academy_id`;
6. manter `user_id` temporariamente onde ainda for útil para auditoria/compatibilidade;
7. remover dependências de `user_id` apenas em uma migração futura, não nesta entrega.

A tabela atual `academy_profiles` será tratada como legado. Seus dados serão migrados para `academies` e `profiles` e o frontend deixará de usá-la. Não será apagada nesta primeira migração para permitir rollback seguro.

## Fluxo de novo cadastro

O cadastro público solicitará obrigatoriamente:

- Nome da academia;
- Nome do professor responsável;
- Telefone/WhatsApp;
- E-mail;
- Senha;
- Confirmar senha.

Fluxo:

1. usuário cria conta via Supabase Auth;
2. após confirmação de e-mail e primeiro login, o sistema executa um bootstrap transacional;
3. cria `profiles`;
4. cria `academies` usando e-mail e telefone do responsável como contato inicial oficial;
5. cria `academy_members` com `role = 'owner'`;
6. salva `active_academy_id` na sessão/estado do frontend;
7. libera o sistema.

O frontend nunca envia `platform_role = 'platform_admin'`.

## Migração de usuários existentes

Usuários atuais não serão apagados e não precisarão criar conta novamente.

No primeiro login após a atualização, se não existir vínculo em `academy_members`, o sistema mostrará uma tela bloqueante “Complete seu perfil”.

Campos:

- Nome da academia;
- Nome do professor responsável;
- WhatsApp obrigatório.

O e-mail vem da sessão atual e não precisa ser digitado novamente.

Ao salvar:

1. cria `profiles` se necessário;
2. cria `academies`;
3. cria vínculo `academy_members` como `owner`;
4. atualiza `academy_id` em todas as turmas, alunos, pagamentos, recibos, automações e configurações pertencentes ao `user_id` atual;
5. valida contagens antes e depois;
6. somente então libera a aplicação.

A operação deve ser idempotente: recarregar a página ou repetir o fluxo não pode criar duas academias.

## Aba Meu Perfil

A interface terá uma aba/página própria e substituirá o conceito atual de “Configurações da academia”.

### Academia

- Nome da academia;
- E-mail oficial;
- WhatsApp oficial;
- Logo personalizada;
- pré-visualização da logo;
- remover/substituir logo.

Esses dados são os dados oficiais usados nos recibos e mensagens.

### Professor responsável

- Nome do professor;
- E-mail de login, inicialmente somente leitura nesta versão;
- Telefone pessoal, inicialmente igual ao WhatsApp oficial no cadastro.

O contato oficial de recibos e mensagens continua sendo o da academia, não de professores secundários futuros.

### Segurança

- senha atual;
- nova senha;
- confirmar nova senha.

A alteração deve exigir reautenticação recente ou validação da senha atual antes de `updateUser`.

## Logo da academia

A logo será armazenada no Supabase Storage em bucket dedicado, por exemplo `academy-logos`.

Estrutura de caminho:

```text
academy-logos/{academy_id}/logo.<ext>
```

Regras:

- somente membros autorizados da academia podem ler/escrever sua própria logo;
- `platform_admin` em modo suporte pode gerenciar a logo da academia acessada;
- validar MIME real e extensão aceita (`image/png`, `image/jpeg`, `image/webp`);
- limitar tamanho do arquivo;
- substituir a logo anterior em vez de acumular arquivos sem uso.

A URL pública não deve ser usada como mecanismo de autorização. A política do bucket deve proteger escrita e leitura conforme a estratégia escolhida.

## Recibos e mensagens

O código atual usa `academy_profiles` para nome da academia, responsável e telefone. A nova fonte de verdade será:

- `academies.name`;
- `academies.contact_phone`;
- `academies.contact_email`;
- `academies.logo_path`;
- `profiles.full_name` do `owner` para identificação do professor responsável quando necessário.

Recibos PDF devem usar a logo da academia quando cadastrada; caso contrário, usar layout sem logo personalizada.

Mensagens automáticas continuarão com textos padronizados pela Dassaevy Labs. A academia configura apenas identidade e contato.

## Painel Dassaevy Labs

Somente `platform_admin` verá esse painel.

Primeira versão:

- lista de academias;
- nome da academia;
- professor responsável;
- e-mail;
- telefone;
- data de cadastro;
- quantidade de turmas;
- quantidade de alunos;
- status estrutural de assinatura;
- botão “Acessar academia”.

Não implementar cobrança real nesta fase.

## Modo suporte

Ao clicar “Acessar academia”:

1. criar registro em `support_access_logs`;
2. definir `support_academy_id` apenas no estado/sessão segura da aplicação;
3. mostrar banner fixo: “Modo suporte — você está acessando: {academia}”;
4. todas as consultas passam a usar o contexto da academia selecionada;
5. exibir botão “Sair do modo suporte”;
6. ao sair, preencher `ended_at` e limpar o contexto.

O modo suporte não deve imitar a autenticação do professor nem trocar a sessão Supabase do usuário. A conta continua sendo `platform_admin`; apenas o contexto de academia muda.

## RLS e segurança

A segurança não pode depender de botões escondidos no frontend.

Será criada uma função SQL estável para verificar associação à academia, por exemplo:

```sql
public.is_academy_member(target_academy_id uuid)
```

E outra para verificar administração da plataforma:

```sql
public.is_platform_admin()
```

Políticas conceituais:

- usuário comum só lê/escreve registros cujo `academy_id` pertença a uma associação ativa em `academy_members`;
- `owner` pode editar os dados da própria academia;
- `teacher` ficará preparado para políticas futuras, mas nesta versão ainda não terá fluxo de criação;
- `platform_admin` pode consultar academias globalmente;
- acesso operacional a dados de uma academia por `platform_admin` deve ser permitido apenas dentro do mecanismo de suporte definido no backend/RPC, evitando depender apenas de um ID escolhido no frontend;
- nenhuma policy aceita `user_id` ou `academy_id` fornecido pelo cliente sem validação contra `auth.uid()`.

Para operações sensíveis de suporte, preferir RPCs `security definer` com validação explícita do papel e registro de auditoria em vez de políticas globais permissivas.

## Isolamento de dados

Critério obrigatório de aceite:

- Professor da Academia A não consegue ler, atualizar, inserir ou excluir qualquer registro da Academia B, mesmo usando diretamente a API REST do Supabase;
- mudar IDs manualmente no navegador não concede acesso;
- um professor não pode se promover a `platform_admin`;
- um professor não pode criar vínculo em outra academia;
- um `platform_admin` não consegue alterar senha de professor pela aplicação;
- modo suporte gera log de entrada e saída.

## Estado no frontend

Introduzir um contexto único de sessão, conceitualmente:

```js
sessionContext = {
  user,
  profile,
  platformRole,
  memberships,
  activeAcademy,
  supportMode
}
```

Os módulos deixam de assumir que `currentUser.id` é a identidade da academia. Toda consulta dependente de cliente usa `activeAcademy.id`.

## Compatibilidade com o sistema atual

A atualização deve preservar:

- login e recuperação de senha atuais;
- turmas existentes;
- alunos existentes;
- pagamentos existentes;
- relatórios;
- recibos;
- automações;
- filtros por turma;
- exportação DOCX;
- layout responsivo.

As mudanças de arquitetura não devem reescrever funcionalidades que já funcionam sem necessidade.

## Estratégia de implementação

### Fase 1 — Banco e migração

Criar novas tabelas, colunas `academy_id`, funções auxiliares, RLS e migração compatível com contas antigas.

### Fase 2 — Bootstrap de conta

Novo fluxo de cadastro e tela de completar perfil para usuários legados.

### Fase 3 — Meu Perfil

Dados da academia, responsável, logo e segurança.

### Fase 4 — Integrações existentes

Recibos, mensagens, automações, relatórios e consultas passam a usar contexto de academia.

### Fase 5 — Painel Dassaevy Labs

`platform_admin`, listagem global e modo suporte auditado.

### Fase 6 — Testes de isolamento e regressão

Testes SQL/RLS, testes de frontend e validação manual das duas academias em sessões independentes.

## Testes obrigatórios

- novo cadastro cria exatamente uma academia e um `owner`;
- cadastro público nunca cria `platform_admin`;
- usuário antigo migra uma única vez;
- dados antigos permanecem vinculados após migração;
- professor A não acessa dados do professor B;
- troca de academia via payload manual é rejeitada;
- perfil atualiza recibos e mensagens subsequentes;
- upload de logo respeita a academia;
- alteração de senha exige validação adequada;
- `platform_admin` enxerga painel global;
- modo suporte cria log;
- sair do modo suporte encerra log;
- funcionalidades atuais continuam operando após a migração.

## Critérios de aceite

A entrega será considerada pronta quando:

1. contas novas já nascerem em uma academia própria;
2. contas antigas migrarem sem perda de dados;
3. Meu Perfil controlar os dados oficiais da academia;
4. recibos e mensagens consumirem esses dados;
5. logo personalizada aparecer nos recibos quando cadastrada;
6. Dassaevy Labs possuir painel administrativo separado;
7. modo suporte for explícito e auditado;
8. RLS impedir acesso cruzado entre academias;
9. estrutura permitir adicionar professores no futuro sem nova remodelagem do banco;
10. nenhuma cobrança real for exigida nesta versão, mas a conta Dassaevy Labs já possuir estrutura de isenção futura.
