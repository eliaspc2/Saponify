# Backlog de Implementação UI/UX

Data: 2026-02-08
Estado: execução parcial concluída.

## 1. Paginação em listas longas (Prioridade 3) — Concluído
Objetivo: melhorar navegação e reduzir carga visual/API em listas extensas.

Subtarefas concluídas:
- Definido contrato comum de paginação no `BaseListPage`.
- Implementada paginação em UI com controlos consistentes (anterior, próxima, tamanho da página).
- Pesquisa já repõe para página 1 e mantém consistência do resultado paginado.
- Aplicado em listas de Clientes, Questionários e Receitas.

## 2. Autocomplete para dropdowns longos (Prioridade 6) — Concluído
Objetivo: reduzir fricção em seleção de itens longos.

Subtarefas concluídas:
- Criado componente reutilizável de autocomplete (input + lista filtrada + teclado + blur/focus).
- Substituídos dropdowns longos de cliente em Questionários e Receitas.
- Mantida navegação por teclado básica (setas, enter, escape).
- Uniformizado com estilo de `form-control` existente.

## 3. Remoção de segredos críticos da UI (Prioridade 7) — Adiado
Objetivo: reduzir exposição de dados sensíveis e alinhar segurança operacional.

Estado:
- Não implementado nesta iteração, conforme decisão.

## Critério de saída
- Cada item só é marcado como concluído com validação funcional e sem regressões visuais principais.
