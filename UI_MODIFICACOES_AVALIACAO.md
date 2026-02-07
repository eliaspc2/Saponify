# Avaliação das Modificações UX/UI

Data: 2026-02-07
Escopo: avaliação estratégica e pontos pendentes após extração do backlog executável.

## Nota de consolidação
As alterações consideradas inquestionavelmente úteis foram removidas deste documento e migradas para:
- `UI_TAREFAS_IMPLEMENTACAO.md`

Este ficheiro fica agora focado apenas em decisões, restrições e itens que exigem validação adicional.

## Decisões de guardrail (mantidas)
- Em mobile, não concentrar todas as ações globais numa top bar rígida; usar overflow (`Mais`) para evitar saturação.
- Não remover todos os ícones indiscriminadamente; manter os que carregam semântica de estado.
- Não substituir todo e qualquer `alert()` por modal; usar toast para feedback simples e modal para ações destrutivas.
- Não ativar envio automático de questionários por defeito; exigir modelo opt-in com critério e controlo.
- Não migrar cegamente toda configuração crítica para environment; separar segredos de preferências operacionais runtime.

## Itens pendentes de decisão/escopo

### Prioridade 3
- Paginação em listas grandes (Clientes, Questionários, Receitas):
  - Recomendado, mas depende de validação de UX (tamanho de página, navegação, impacto no fluxo atual).

### Prioridade 4
- Validação inline por campo com bloqueio de gravação:
  - Recomendado, mas precisa padrão transversal para evitar comportamento inconsistente entre formulários.
- Substituição de tooltips nativos (`title`) por componente próprio:
  - Recomendado, mas requer componente reutilizável e regra de acessibilidade.

### Prioridade 6
- Autocomplete para dropdowns longos:
  - Recomendado, mas depende de escolher componente base comum para CRM/Questionários.
- Envio seletivo de questionários por idade da última submissão:
  - Funcionalmente útil, mas precisa regras de consentimento e histórico de envio.

### Prioridade 7
- Remoção de segredos críticos da UI:
  - Recomendado, mas precisa plano técnico por tipo de segredo (build-time vs runtime).
- Avaliação de tabs em páginas densas:
  - Só avançar após medição de densidade real e teste de usabilidade.

## Regra de manutenção deste documento
- Se um item entrar no backlog executável com subtarefas e ordem de execução, deve ser removido daqui.
- Este ficheiro deve conter apenas o que ainda está em validação, design decision ou dependência técnica.
