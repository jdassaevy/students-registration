# Padrão de UI e Motion — Dassaevy Labs

## Referência obrigatória

Toda criação ou alteração visual do sistema deve seguir a skill pública `kylezantos/design-motion-principles`, em modo **Create**.

Contexto do produto: **SaaS dashboard / ferramenta de produtividade**.

Peso de decisão adotado:

1. **Emil Kowalski — principal:** decidir se uma animação deve existir, priorizando velocidade, clareza e baixa fricção.
2. **Jakub Krehel — secundário:** aplicar acabamento sutil e profissional quando a animação tiver função real.
3. **Jhey Tompkins — seletivo:** somente para onboarding, empty states ou momentos raros onde um pouco de expressão ajude a experiência.

## Princípios obrigatórios

- Motion deve comunicar feedback, orientação, continuidade ou mudança de estado; nunca existir apenas como decoração.
- Interações frequentes devem ser instantâneas ou quase instantâneas.
- Interações iniciadas por teclado não devem ganhar animações ornamentais.
- Entradas podem usar `opacity`, `translateY` pequeno e `blur` sutil; saídas devem ser ainda mais discretas.
- Preferir animações na faixa de 180–250 ms para interações comuns do dashboard e permanecer abaixo de 300 ms quando possível.
- Usar curvas customizadas ou spring sem bounce; não usar `ease`/`ease-in-out` genéricos como padrão de produção.
- Animar somente propriedades baratas, principalmente `transform`, `opacity` e `filter`. Evitar animar `width`, `height`, `top`, `left`, `margin` e `padding`.
- `will-change` deve ser usado somente quando necessário e em poucos elementos.
- Toda motion deve possuir caminho para `prefers-reduced-motion: reduce`.
- Evitar zoom amplo, parallax, spin e loops contínuos de atenção.

## Estados de carregamento

Toda operação assíncrona visível deve comunicar seu estado ao usuário.

### Conteúdo e dados

- Tabelas, cards, dashboards e áreas que dependem de consulta remota devem usar **skeleton** enquanto o layout final ainda não possui dados.
- O skeleton deve aproximar o formato real do conteúdo para reduzir layout shift.
- Não inserir atrasos artificiais apenas para exibir skeleton.
- Ao concluir a consulta, a substituição skeleton → conteúdo deve ser curta e discreta.

### Ações

- Botões que disparam operação assíncrona devem entrar em estado de loading, ficar protegidos contra envio duplicado e comunicar conclusão/erro.
- Quando houver progresso realmente mensurável, exibir progresso determinado.
- Quando a duração não puder ser medida, usar feedback indeterminado; não inventar percentuais falsos.
- Mudanças importantes de estado devem ter feedback textual acessível além da animação.

## Lazy loading

- Recursos, módulos ou conteúdos pesados que não são necessários para a primeira interação devem ser carregados sob demanda.
- Lazy loading não deve atrasar recursos críticos para login, navegação ou a ação imediata do usuário.
- Conteúdo carregado sob demanda deve possuir skeleton/loading próprio para evitar áreas vazias ou saltos de layout.

## Entrada e saída de elementos

- Dialogs, painéis, toasts, formulários condicionais, empty states e conteúdos carregados dinamicamente devem ter entrada e saída suaves quando a frequência de uso permitir.
- Entrada padrão: pequena mudança de posição + opacidade; blur leve somente quando melhorar a leitura da transição.
- Saída: menor deslocamento e menor destaque que a entrada.
- Elementos rapidamente reacionáveis devem usar transitions interrompíveis, não keyframes que formem fila.

## Cobertura

Esta regra vale para:

- telas existentes quando forem alteradas;
- novas telas e fluxos;
- login e onboarding;
- tabelas e dashboards;
- formulários e dialogs;
- botões e ações assíncronas;
- navegação;
- toasts e feedbacks;
- módulos carregados sob demanda.

A fundação multi-academia continua sendo implementada em tarefas pequenas. O retrofit visual completo da interface existente deve ser feito como etapa dedicada para não misturar alterações de segurança/tenant com uma grande refatoração visual. Até lá, qualquer interface criada ou modificada já deve obedecer a este padrão.

## Gate de qualidade para UI

Uma alteração visual não está pronta enquanto não confirmar:

- skeleton/loading onde existe espera perceptível;
- lazy loading quando o recurso não é crítico e o adiamento traz benefício real;
- feedback de progresso/estado em ações assíncronas;
- entrada e saída coerentes quando motion é apropriado;
- nenhuma animação desnecessária em interações de alta frequência;
- `prefers-reduced-motion` funcionando;
- animações limitadas a propriedades performáticas;
- ausência de loops decorativos e efeitos que distraiam do trabalho.
