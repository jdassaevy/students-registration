# Students Registration

Sistema web de gestão de alunos desenvolvido pela **Dassaevy Labs** para academias e projetos de dança.

A aplicação centraliza cadastro de alunos e casais, organização por turmas, controle financeiro individual, vencimentos, relatórios, automações e histórico de pagamentos em uma interface responsiva.

## Principais funcionalidades

- Cadastro de alunos individuais ou casais
- Organização e filtro por turmas
- Nome, local, dia, horário e data de início da turma
- Controle individual de inscrição e 3 mensalidades por pessoa
- Valores de inscrição e mensalidade configuráveis por aluno
- Cálculo dos vencimentos a partir da data de início da turma
- Painel financeiro geral e por turma
- Detalhamento financeiro dos alunos
- Dashboard de visão geral
- Gráficos de receita, inadimplência e desempenho por turma
- Histórico de pagamentos com data real de recebimento
- Exportação da lista de uma turma em DOCX
- Autenticação e recuperação de senha
- Perfil da academia e do professor responsável
- Logo personalizada da academia
- Recibos PDF com identidade oficial da academia
- Central de automações e histórico de mensagens
- Arquitetura multi-academia com Row Level Security por academia
- Painel administrativo da Dassaevy Labs e modo suporte auditado
- Estrutura preparada para múltiplos professores e cobrança futura
- Interface responsiva e animações de transição

## Tecnologias

- HTML5
- CSS3
- JavaScript
- Supabase Auth
- PostgreSQL / Supabase
- Supabase Storage
- Supabase Edge Functions
- Row Level Security (RLS)
- Chart.js
- docx.js
- GitHub Actions
- GitHub Pages

## Organização

- `app/js/core/`: inicialização, autenticação, contexto da academia e fluxo principal.
- `app/js/features/`: funcionalidades independentes da interface.
- `app/js/tests/`: testes automatizados e contratos de arquitetura.
- `app/css/`: estilos base e tema visual.
- `app/database/`: SQLs de referência e apoio à arquitetura.
- `supabase/migrations/`: migrations executáveis e ordenadas do Supabase.
- `supabase/functions/`: Edge Functions e módulos compartilhados.
- `docs/multi-academy-rollout.md`: procedimento seguro de rollout e rollback da arquitetura multi-academia.
- `.github/workflows/test.yml`: validação de sintaxe e suíte Node em branches e PRs.
- `.github/workflows/deploy-pages.yml`: deploy do frontend a partir da `main`.

## Executando localmente

Não há processo de build do frontend.

1. Clone o repositório.
2. Abra o projeto no Visual Studio Code.
3. Inicie `app/index.html` com um servidor local, como **Live Server**.
4. Use um projeto Supabase compatível com as migrations do repositório.

Para executar a suíte de testes:

```bash
node --test app/js/tests/*.test.mjs app/js/tests/*.test.js
```

## Banco de dados e segurança

A **academia** é a unidade principal de isolamento. Usuários são vinculados a academias por `academy_members`, e dados operacionais carregam `academy_id`.

As políticas de **Row Level Security** garantem que professores acessem somente academias das quais são membros. A conta interna `platform_admin` da Dassaevy Labs só acessa dados de uma academia durante um modo suporte explícito e registrado em `support_access_logs`.

A promoção para `platform_admin` é feita exclusivamente no backend; o cadastro público nunca recebe esse privilégio.

Durante a migração multi-academia, os campos legados `user_id` e a tabela `academy_profiles` são preservados temporariamente para compatibilidade e rollback seguro.

## Rollout multi-academia

A atualização multi-academia envolve banco, RLS, Storage, Edge Functions e frontend. **Não aplique apenas parte da atualização em produção.**

O procedimento completo, a ordem das migrations, testes obrigatórios de isolamento e estratégia de rollback estão em `docs/multi-academy-rollout.md`.

## Deploy

O frontend é publicado automaticamente pelo workflow `.github/workflows/deploy-pages.yml` quando alterações chegam à branch `main`.

Branches e pull requests passam pelo workflow `.github/workflows/test.yml`, que valida a sintaxe dos scripts e executa a suíte automatizada antes do merge.

## Arquitetura

O projeto permanece propositalmente leve, com JavaScript puro no frontend. O backend utiliza Supabase Auth, PostgreSQL/RLS, Storage e Edge Functions.

A separação entre `profiles`, `academies` e `academy_members` permite evoluir para múltiplos professores por academia sem reconstruir o modelo de dados.

## Autor

Desenvolvido por **Júlio Dassaevy** — **Dassaevy Labs**.
