# Contributing Checklist (Noviessence)

This project is architecturally strict. If you are unsure, stop and read `ARCHITECTURE.md`.

## 1) Mandatory questions BEFORE writing code (answer SIM / NÃO)
- Isto é lógica de domínio?
- Isto envolve IO / persistência / APIs externas?
- Isto é coordenação de fluxos?
- Isto é apresentação / UI?
- Isto depende de dados do utilizador ou apenas de regras?
- Isto pode ser reutilizado fora da UI?

Se não for possível responder claramente → não escrevas código ainda.

## 2) Onde o código DEVE ir

| Tipo de código | Pasta correta |
| --- | --- |
| Cálculo / regras | `backend/domain` |
| Persistência / IO / APIs | `backend/infrastructure` |
| Coordenação / fluxos | `orchestrator` |
| UI / apresentação | `frontend` |
| Configuração / cross-cutting | `backend/shared` |
| IA | `backend/ai` |

## 3) Onde o código NUNCA deve ir
- ❌ Cálculo na UI
- ❌ Lógica de domínio no AppController
- ❌ IO no Domain
- ❌ IA fora do backend
- ❌ Settings lidos diretamente na UI
- ❌ Imports “para cima” nas camadas

## 4) Regras de dependência (não negociáveis)
Frontend → Orchestrator → Backend/Application → Backend/Domain → Backend/Shared  
Backend/Application → Backend/Infrastructure

Se uma dependência “parece útil”, mas viola esta direção, está errada.

## 5) Regra de ouro
Se não souberes em que camada algo pertence, não escrevas código.  
Volta ao `ARCHITECTURE.md`.
