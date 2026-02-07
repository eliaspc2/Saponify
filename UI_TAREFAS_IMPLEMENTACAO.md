# Tarefas Iniciais de Implementação UX/UI (Inquestionavelmente Úteis)

Data: 2026-02-07
Base: `UI_MODIFICACOES_AVALIACAO.md`

## Escopo deste backlog
Inclui apenas mudanças com ganho imediato de espaço, clareza e consistência, sem decisões funcionais controversas.

## Estado de execução (2026-02-07)
- Concluídas nesta fase: `T1`, `T2`, `T3`, `T4`, `T5`, `T6`, `T7`, `T8`, `T9`, `T10`.
- Em progresso: nenhuma tarefa desta fase inicial.
- Por iniciar: itens que dependem de componente transversal adicional fora do escopo atual.

## Fora desta fase inicial
- Envio automático de questionários.
- Migração total de configurações críticas para environment.
- Reestruturações grandes de navegação por tabs.

## Bloco A — Quick Wins de Layout

### T1. Compactar sidebar e navegação lateral
Objetivo: recuperar largura útil da área principal.

Sub-passos:
1. Reduzir `.sidebar` de `260px` para `220px` em `app/frontend/index.css`.
2. Reduzir `padding`/`gap` dos itens em `app/frontend/core/Layout.tsx`.
3. Validar que labels continuam legíveis em desktop e mobile.

Definition of Done:
- Área principal visivelmente mais larga sem quebra de layout.
- Sidebar continua funcional em `<= 768px`.htthttps://eliaspc2.github.io/OnlineCV/ps://eliaspc2.github.io/OnlineCV/

### T2. Reduzir paddings globais para aumentar densidade útil
Objetivo: reduzir scroll desnecessário.

Sub-passos:
1. Ajustar `.card` para `1.25rem` em `app/frontend/index.css`.
2. Ajustar `.page-container` para `0 1.25rem 1.25rem 1.25rem`.
3. Ajustar `th` e `td` para `0.75rem`.
4. Rever páginas com padding inline excessivo e alinhar com o novo padrão.

Definition of Done:
- Menos scroll em Home, Calculadora, Clientes e Settings.
- Sem sobreposição visual entre blocos.

### T3. Tornar resumo principal da calculadora sticky
Objetivo: manter contexto de resultados durante edição da receita.

Sub-passos:
1. Definir comportamento sticky para painel de resultados em `app/frontend/index.css`.
2. Ajustar `top` para não colidir com header sticky.
3. Testar scroll em desktop e mobile.

Definition of Done:
- Painel de resumo mantém-se visível durante scroll longo.
- Sem clipping, sem saltos de layout.

## Bloco B — Consistência de Inputs e Estados

### T4. Uniformizar altura de campos de formulário
Objetivo: coerência visual e melhor ritmo de leitura.

Sub-passos:
1. Definir altura padrão `44px` para `input/select` em `app/frontend/index.css`.
2. Alinhar `.search-bar` para a mesma altura.
3. Corrigir exceções onde houver estilos inline conflitantes.

Definition of Done:
- Inputs e selects com altura consistente nas páginas principais.
- Search bars visualmente alinhadas ao restante formulário.

### T5. Melhorar estados `disabled` e campos obrigatórios
Objetivo: aumentar clareza de interação e reduzir erros.

Sub-passos:
1. Definir estilo `disabled` com contraste claro (fundo + border + texto), não apenas opacidade.
2. Marcar campos obrigatórios com `*` e estilo consistente.
3. Validar botões de guardar para estado visual claro entre enabled/disabled.

Definition of Done:
- Utilizador distingue de imediato o que está bloqueado.
- Campos obrigatórios estão visíveis e consistentes.

## Bloco C — Listas e Fluxo de Trabalho

### T6. Aproximar filtros do conteúdo que afetam
Objetivo: reduzir carga cognitiva no uso de listas.

Sub-passos:
1. Garantir filtros imediatamente acima da tabela/lista em `BaseListPage`.
2. Reduzir margem vertical entre filtros e resultados em `app/frontend/index.css`.
3. Rever ordem de filtros (estado > data > pesquisa) onde aplicável.

Definition of Done:
- Relação filtro-resultado fica óbvia em Clientes, Questionários, Receitas e Ingredientes.

### T7. Densificar tabelas e fixar padrão de ações por linha
Objetivo: mostrar mais informação por viewport com melhor usabilidade.

Sub-passos:
1. Reduzir altura efetiva de linha de tabela para alvo 44–50px.
2. Uniformizar coluna de ações por item na própria linha.
3. Remover ícones sem função; manter apenas ícones semânticos de estado.

Definition of Done:
- Mais linhas visíveis por ecrã.
- Ações por item sempre no mesmo sítio visual.

## Bloco D — Melhorias Diretas na Calculadora

### T8. Consolidar exportações em botão único com submenu
Objetivo: limpar barra de ações sem perder funcionalidades.

Sub-passos:
1. Criar botão `Exportar` com submenu (`Markdown`, `JSON`, `Backup`) em `CalculatorPage`.
2. Reaproveitar padrão de menu já usado (`.phase-add-menu`) e adaptar para acessibilidade.
3. Manter `Guardar Receita` como ação primária separada.

Definition of Done:
- Menos ruído visual na toolbar.
- Exportações continuam todas acessíveis em 1 clique + seleção.

### T9. Mostrar mínimos e máximos nos sliders
Objetivo: reduzir ambiguidade nos controlos da receita.

Sub-passos:
1. Adicionar labels de min/max junto a cada slider em `CalculatorPage`.
2. Reduzir espaço vertical dos blocos de slider em `index.css`.
3. Validar legibilidade e toque em ecrã pequeno.

Definition of Done:
- Cada slider mostra limites de forma explícita.
- Blocos ocupam menos altura sem piorar leitura.

## Bloco E — Feedback de Utilizador (fase segura)

### T10. Substituir `alert()` simples por feedback não bloqueante
Objetivo: melhorar fluxo sem interromper o utilizador.

Sub-passos:
1. Criar componente base de toast em `app/frontend/components`.
2. Migrar alertas de sucesso/info para toast nas páginas principais.
3. Manter modal apenas para confirmações destrutivas.

Definition of Done:
- Alertas de sucesso deixam de bloquear fluxo.
- Ações destrutivas continuam protegidas por confirmação explícita.

## Ordem recomendada de implementação
1. T1
2. T2
3. T4
4. T6
5. T7
6. T8
7. T3
8. T9
9. T5
10. T10

## Checklist de validação final
- Desktop 1366x768: menos scroll e melhor densidade.
- Mobile <= 768px: sem quebra de layout nem overflow horizontal indevido.
- Ações primárias continuam evidentes.
- Sem regressões funcionais em guardar/exportar/filtrar.
