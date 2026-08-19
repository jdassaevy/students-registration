# Gestão de Alunos — Arte Nativa

Aplicação web desenvolvida para facilitar o cadastro e o controle de alunos da **Família Arte Nativa**.

O sistema permite organizar alunos individuais ou casais por turmas, acompanhar inscrições e controlar separadamente o pagamento das mensalidades de cada pessoa.

## Funcionalidades

- Cadastro de alunos individuais ou casais
- Segundo integrante do casal opcional
- Criação e exclusão de turmas
- Definição de nome, local, dia e horário da turma
- Organização dos alunos por turma
- Filtro de alunos por turma
- Busca pelo nome do aluno ou casal
- Controle do pagamento da inscrição
- Controle individual de 3 mensalidades para cada pessoa
- Edição dos cadastros
- Exclusão de alunos ou casais
- Resumo de alunos, inscrições, mensalidades e turmas
- Interface responsiva para computadores e celulares
- Salvamento automático dos dados no navegador

## Tecnologias utilizadas

- HTML5
- CSS3
- JavaScript
- LocalStorage

## Estrutura do projeto

```text
arte-nativa/
├── index.html
├── style.css
├── script.js
└── README.md
```

Se o CSS e o JavaScript estiverem dentro do próprio HTML, a estrutura também pode ser:

```text
arte-nativa/
├── index.html
└── README.md
```

## Como executar

1. Faça o download ou clone este repositório:

```bash
git clone URL_DO_REPOSITORIO
```

2. Abra a pasta do projeto no Visual Studio Code.

3. Abra o arquivo `index.html` diretamente no navegador ou utilize a extensão **Live Server**.

4. Caso utilize o Live Server, clique com o botão direito no `index.html` e escolha **Open with Live Server**.

Não é necessário instalar dependências ou executar comandos adicionais.

## Como utilizar

### Criar uma turma

1. Clique em **Nova turma**.
2. Informe o nome da turma.
3. Preencha o local, dia e horário, se desejar.
4. Clique em **Criar turma**.

### Cadastrar um aluno ou casal

1. Clique em **Cadastrar casal** ou **Cadastrar aluno ou casal**.
2. Preencha o nome da primeira pessoa.
3. Preencha o segundo nome somente quando for um casal.
4. Selecione a turma.
5. Marque a inscrição e as mensalidades já pagas.
6. Clique em **Salvar**.

### Controlar mensalidades

Cada pessoa possui três mensalidades independentes. Clique no número da mensalidade para alternar entre **paga** e **pendente**.

Isso permite registrar situações em que somente uma das pessoas do casal realizou o pagamento.

## Armazenamento dos dados

Os dados são armazenados no `LocalStorage` do navegador. Dessa forma, os registros continuam disponíveis depois que a página é fechada ou atualizada.

> **Atenção:** os dados ficam salvos somente no navegador e no dispositivo utilizados. Limpar os dados de navegação, utilizar outro computador ou abrir outro navegador não carregará automaticamente os mesmos registros.

Para uso em vários dispositivos, o projeto precisará futuramente de um banco de dados e um sistema de autenticação.

## Responsividade

A aplicação foi adaptada para funcionar em computadores, tablets e celulares. Em telas menores, os formulários possuem rolagem interna e a tabela pode ser movimentada horizontalmente.

## Publicação no GitHub Pages

1. Abra o repositório no GitHub.
2. Acesse **Settings**.
3. Clique em **Pages**.
4. Em **Build and deployment**, selecione **Deploy from a branch**.
5. Escolha a branch `main` e a pasta `/root`.
6. Clique em **Save**.

Após alguns minutos, o GitHub disponibilizará o endereço público da aplicação.

## Melhorias futuras

- Banco de dados online
- Login de administradores
- Sincronização entre dispositivos
- Exportação de relatórios em PDF ou Excel
- Controle de presença nas aulas
- Histórico completo de pagamentos
- Cadastro de professores
- Painel financeiro

## Autor

Desenvolvido por **Júlio Dassaevy** para a **Família Arte Nativa**.

---

**Família Arte Nativa — fazendo amigos através da dança.**
