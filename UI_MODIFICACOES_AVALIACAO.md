# Avaliação das Modificações UX/UI

Data: 2026-02-08
Escopo: decisões pendentes após mover para backlog o que está aprovado para implementação.

## Nota de consolidação
Os itens com boa relação valor/risco foram movidos para:
- `UI_TAREFAS_IMPLEMENTACAO.md`

Este ficheiro mantém apenas o que tem menor consenso técnico para implementação imediata.

## Decisões de guardrail (mantidas)
- Em mobile, não concentrar todas as ações globais numa top bar rígida; usar overflow (`Mais`) para evitar saturação.
- Não remover todos os ícones indiscriminadamente; manter os que carregam semântica de estado.
- Não substituir todo e qualquer `alert()` por modal; usar toast para feedback simples e modal para ações destrutivas.
- Não ativar envio automático de questionários por defeito; exigir modelo opt-in com critério e controlo.
- Não migrar cegamente toda configuração crítica para environment; separar segredos de preferências operacionais runtime.

## Itens com menor concordância para avançar já

### Prioridade 6
- Envio seletivo de questionários por idade da última submissão:
  - Útil, mas com risco de consentimento/compliance e necessidade de histórico de envios robusto.

### Prioridade 7
- Avaliação de tabs em páginas densas:
  - Só avançar após medição de densidade real e teste de usabilidade; risco de adicionar complexidade sem ganho claro.

## Regra de manutenção deste documento
- Se um item passar a backlog executável com subtarefas e ordem de execução, deve sair daqui.
- Este ficheiro deve conter apenas decisões, riscos e dependências por validar.
