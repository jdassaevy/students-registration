# Etapa 5 — Automação e WhatsApp Design

## Objetivo

Adicionar automações reais de WhatsApp ao sistema de alunos usando a API oficial do WhatsApp Cloud da Meta, com backend seguro em Supabase Edge Functions, lembretes automáticos, recibos em PDF e trilha de auditoria para estornos.

## Decisões aprovadas

- Usar um único número oficial da Dassaevy Labs para os envios automáticos.
- Cada academia configura os próprios dados de identidade e contato.
- O texto das mensagens é 100% definido pela Dassaevy Labs.
- Os vencimentos continuam sendo derivados exclusivamente da data de início da turma.
- Cadência fixa de lembretes: 3 dias antes, no dia do vencimento e 3 dias depois se continuar pendente.
- Marcar um pagamento como recebido cancela lembretes futuros daquela cobrança.
- Ao marcar um pagamento como recebido, o sistema gera recibo PDF e tenta enviá-lo automaticamente pelo WhatsApp.
- O recibo usa a academia como identidade principal e mostra “Gerado por Dassaevy Labs” no rodapé.
- Desmarcar um pagamento não apaga o recibo original: o registro é marcado como estornado/cancelado e o aluno recebe aviso de cancelamento quando elegível.
- Telefone do aluno é opcional.
- Consentimento para WhatsApp é opcional, individual por aluno e desmarcado por padrão.
- Sem telefone ou sem consentimento, o aluno continua usando todas as demais funções; apenas as automações de WhatsApp não são enviadas.
- Em casais, telefone e consentimento são independentes para cada pessoa.

## Arquitetura

### Frontend

O frontend continua estático em `app/`. Ele passa a coletar:

- telefone da pessoa 1;
- consentimento WhatsApp da pessoa 1;
- telefone da pessoa 2, se existir;
- consentimento WhatsApp da pessoa 2;
- dados da academia em uma nova área de configurações.

O frontend nunca recebe tokens da Meta ou chaves administrativas do backend.

### Banco de dados

Adicionar estruturas para:

1. perfil da academia;
2. telefone e consentimento por pessoa;
3. recibos e status de recibo;
4. fila/log de automações;
5. controle idempotente de lembretes para evitar disparos duplicados;
6. auditoria de envio, falha e estorno.

### Supabase Edge Functions

Usar funções server-side para:

- montar e enviar mensagens via WhatsApp Cloud API;
- processar lembretes agendados;
- gerar e armazenar recibos PDF;
- enviar recibos após confirmação de pagamento;
- enviar aviso de estorno;
- manter segredos da Meta apenas em variáveis de ambiente do Supabase.

### Agendamento

Usar Supabase Cron/pg_cron para invocar uma Edge Function periodicamente. A função seleciona cobranças elegíveis com base nos vencimentos calculados a partir da data de início da turma e registra cada disparo com chave idempotente.

## Perfil da academia

Criar uma área `Configurações da Academia` com:

- nome da academia;
- nome do professor/responsável;
- telefone de contato para dúvidas;
- nome de exibição opcional para mensagens/recibos;
- status de configuração completa.

Esses dados são controlados pela própria conta autenticada e protegidos por RLS.

## Telefone e consentimento

Cada pessoa do cadastro recebe:

- `phone`: nullable;
- `whatsapp_consent`: boolean, default `false`;
- `whatsapp_consent_at`: nullable timestamp.

Regras:

- telefone vazio não bloqueia cadastro;
- consentimento sem telefone não gera envio;
- telefone sem consentimento não gera envio;
- consentimento pode ser revogado;
- nenhum envio automático é disparado após revogação.

## Regras de lembrete

Para cada mensalidade individual:

- D-3: lembrete amigável;
- D0: aviso de vencimento;
- D+3: aviso de atraso, somente se ainda pendente.

A data base vem do vencimento da mensalidade da turma. A data de cadastro do aluno não participa do cálculo.

Cada lembrete deve possuir uma chave única composta por aluno, pessoa, parcela e tipo de lembrete para evitar duplicidade.

## Templates de mensagem

Os textos são definidos pela Dassaevy Labs e não são editáveis pela academia.

Os templates devem incluir variáveis para:

- nome do aluno;
- nome da academia;
- nome do professor/responsável;
- telefone de contato;
- número da parcela;
- data do vencimento;
- valor devido quando aplicável.

Mensagens iniciadas pela empresa fora da janela permitida pela plataforma devem usar templates aprovados pela Meta.

## Fluxo de pagamento recebido

1. Usuário marca inscrição ou mensalidade como paga.
2. Banco persiste o novo estado.
3. Cria-se um evento de pagamento com valor e data.
4. Gera-se um recibo único.
5. O PDF é salvo em storage privado/controlado.
6. Se houver telefone + consentimento, dispara-se mensagem de confirmação e recibo via backend.
7. Registra-se sucesso ou falha do envio.
8. Lembretes futuros daquela cobrança deixam de ser elegíveis.

## Recibo PDF

Campos mínimos:

- número único do recibo;
- nome da academia;
- nome do aluno;
- turma;
- tipo de pagamento;
- parcela, quando aplicável;
- valor pago;
- data e hora;
- responsável/professor e contato para dúvidas;
- status do recibo;
- rodapé “Gerado por Dassaevy Labs”.

O recibo permanece acessível no histórico mesmo quando o WhatsApp não puder ser enviado.

## Estorno/cancelamento

Quando um pagamento previamente confirmado for desmarcado:

- o recibo não é apagado;
- o recibo muda para status `voided`/estornado;
- registra-se data e motivo técnico do cancelamento;
- é criado um evento de estorno;
- se houver telefone + consentimento, envia-se aviso de cancelamento;
- a cobrança volta a ficar elegível para lembretes futuros conforme as datas e regras aplicáveis.

## Segurança

- Token da Meta nunca vai para o frontend.
- Segredos ficam apenas em Supabase Edge Function Secrets.
- RLS protege dados de academia, alunos, recibos e logs.
- Edge Functions validam usuário/serviço antes de acessar dados.
- Logs não armazenam tokens.
- PDFs não ficam expostos publicamente sem necessidade.

## Observabilidade

Registrar por envio:

- tipo de automação;
- aluno/pessoa;
- cobrança;
- horário planejado;
- horário executado;
- status (`pending`, `sent`, `failed`, `skipped`);
- identificador retornado pelo provedor quando houver;
- erro resumido em caso de falha.

## UI prevista

### Cadastro de aluno/casal

Adicionar telefone e consentimento dentro do bloco de cada pessoa.

### Configurações da Academia

Nova aba ou modal acessível pelo painel principal.

### Financeiro/Histórico

Mostrar recibos gerados e status de envio do WhatsApp, com ação de visualizar recibo. Reenvio manual pode ser adicionado depois, mas não é requisito inicial.

## Fases de implementação

### Fase 5A — Base de dados e UI

- perfil da academia;
- telefone/consentimento;
- recibos/logs/fila;
- UI de configurações.

### Fase 5B — Recibos locais e eventos

- geração do recibo;
- histórico;
- estorno auditável;
- integração com pagamento existente.

### Fase 5C — WhatsApp Cloud API

- Edge Function de envio;
- secrets da Meta;
- templates oficiais;
- envio de confirmação, recibo e estorno.

### Fase 5D — Lembretes agendados

- cron;
- seleção de cobranças elegíveis;
- idempotência;
- D-3, D0 e D+3;
- cancelamento automático após pagamento.

## Critérios de aceite

1. Aluno sem telefone pode ser cadastrado normalmente.
2. Telefone sem consentimento não dispara automações.
3. Consentimento pode ser registrado e revogado por pessoa.
4. Vencimentos usados pelos lembretes vêm da data de início da turma.
5. Nenhum lembrete duplicado é enviado para o mesmo marco.
6. Pagamento marcado como recebido gera recibo mesmo sem WhatsApp.
7. Com telefone + consentimento, o backend tenta envio automático.
8. Estorno preserva o recibo original e registra o cancelamento.
9. Segredos da Meta não aparecem no frontend nem no repositório.
10. Cada academia só acessa seus próprios dados e recibos.
11. Falhas de envio não desfazem o pagamento nem impedem o uso do sistema.

## Fora do escopo inicial

- número de WhatsApp separado por academia;
- edição de templates pelas academias;
- respostas bidirecionais/chat dentro do sistema;
- cobrança por Pix integrada;
- reenvio manual de recibo;
- campanhas de marketing;
- automação de presença/aulas.
