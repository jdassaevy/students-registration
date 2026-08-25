# Students Registration

Sistema web de gestão de alunos desenvolvido pela **Dassaevy Labs** para academias e projetos de dança.

A aplicação centraliza cadastro de alunos e casais, organização por turmas, controle financeiro individual, vencimentos, relatórios e histórico de pagamentos em uma interface responsiva.

## Principais funcionalidades

- Cadastro de alunos individuais ou casais
- Organização e filtro por turmas
- Nome, local, dia, horário e data de início da turma
- Controle individual de inscrição e 3 mensalidades por pessoa
- Valores de inscrição e mensalidade configuráveis por aluno
- Cálculo dos vencimentos a partir da data de início da turma
- Painel financeiro geral e por turma
- Detalhamento financeiro dos alunos em modal
- Dashboard de visão geral
- Gráficos de receita, inadimplência e desempenho por turma
- Histórico de pagamentos com data real de recebimento
- Exportação da lista de uma turma em DOCX
- Autenticação e recuperação de senha
- Separação dos dados por conta com Row Level Security
- Interface responsiva e animações de transição

## Tecnologias

- HTML5
- CSS3
- JavaScript
- Supabase Auth
- PostgreSQL / Supabase
- Row Level Security (RLS)
- Chart.js
- docx.js
- GitHub Actions
- GitHub Pages

## Estrutura do projeto

```text
students-registration/
├── .github/
│   └── workflows/
│       └── deploy-pages.yml
├── app/
│   ├── assets/
│   │   └── images/
│   │       └── dassaevy-labs-mark-transparent.png
│   ├── css/
│   │   ├── style-base.css
│   │   └── style.css
│   ├── database/
│   │   └── supabase-schema.sql
│   ├── js/
│   │   ├── core/
│   │   │   ├── script.js
│   │   │   └── supabase-config.js
│   │   ├── features/
│   │   │   ├── dashboard.js
│   │   │   ├── due-dates.js
│   │   │   ├── financial-details.js
│   │   │   ├── money-input.js
│   │   │   └── reports.js
│   │   └── tests/
│   │       └── money-input.test.js
│   └── index.html
├── docs/
│   └── superpowers/
├── CNAME
└── README.md
```

### Organização

- `app/js/core/`: inicialização, autenticação, estado e fluxo principal da aplicação.
- `app/js/features/`: funcionalidades independentes adicionadas ao sistema.
- `app/js/tests/`: testes automatizados de JavaScript.
- `app/css/`: estilos base e tema visual atual.
- `app/database/`: schema e migrações de referência do Supabase.
- `app/assets/`: recursos visuais utilizados pela interface.
- `.github/workflows/`: automação de deploy do GitHub Pages.

## Executando localmente

Não há processo de build nem dependências para instalar.

1. Clone o repositório.
2. Abra o projeto no Visual Studio Code.
3. Inicie `app/index.html` usando uma extensão como **Live Server**.
4. Configure o Supabase conforme `app/database/supabase-schema.sql` quando necessário.

Para testar o parser de valores monetários com Node.js:

```bash
node app/js/tests/money-input.test.js
```

## Banco de dados e segurança

Os dados são armazenados no PostgreSQL do Supabase. Cada registro é associado ao usuário autenticado e protegido por políticas de **Row Level Security**, mantendo os dados de diferentes contas isolados.

O sistema também mantém um histórico de eventos de pagamento para alimentar relatórios de receita mensal sem inventar datas para pagamentos antigos.

## Deploy

A publicação é feita automaticamente pelo workflow `.github/workflows/deploy-pages.yml`. Ao receber alterações na branch `main`, o GitHub Actions publica o conteúdo da pasta `app/` no GitHub Pages.

## Arquitetura

O projeto continua propositalmente leve, usando JavaScript puro e módulos funcionais separados por responsabilidade. A organização atual facilita manutenção, leitura de código e evolução futura sem exigir um framework ou bundler para o tamanho atual da aplicação.

## Autor

Desenvolvido por **Júlio Dassaevy** — **Dassaevy Labs**.
