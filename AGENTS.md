# AGENTS.md

Estas instruções servem para agentes que trabalham neste repositório.

## 1) Fonte de verdade
- Lê **ARCHITECTURE.md** e **CONTRIBUTING_CHECKLIST.md** antes de escrever código.
- Se houver conflito entre este arquivo e os documentos acima, prevalecem os documentos acima.

## 2) Arquitetura (resumo obrigatório)
Camadas e direção de dependências:
Frontend → Orchestrator → Backend/Application → Backend/Domain → Backend/Shared
Backend/Application → Backend/Infrastructure

Regras-chave:
- Domain: regras puras, sem IO.
- Infrastructure: IO, persistência, integrações, sem regras de domínio.
- Application: coordena casos de uso, orquestra Domain + Infrastructure.
- Orchestrator: wiring/coordenação apenas (AppController).
- Frontend: UI apenas, sem regras de negócio e sem OpenAI.
- IA: somente em `app/backend/ai`.

## 3) Checklist antes de codar
Responde SIM/NÃO:
- É lógica de domínio?
- Envolve IO/persistência/APIs externas?
- É coordenação de fluxos?
- É UI/apresentação?
- Depende de dados do utilizador ou apenas regras?
- Pode ser reutilizado fora da UI?

Se não for possível responder claramente, **não escrevas código**.

## 4) Onde colocar o código
- Cálculo / regras → `app/backend/domain`
- Persistência / IO / APIs → `app/backend/infrastructure`
- Coordenação / fluxos → `app/orchestrator`
- UI / apresentação → `app/frontend`
- Cross‑cutting / contratos → `app/backend/shared` ou `app/shared`
- IA → `app/backend/ai`

## 5) Regras de dependência (não negociáveis)
- Não importar “para cima” nas camadas.
- Não colocar cálculo na UI.
- Não colocar IO no Domain.
- Não ler settings diretamente na UI.

## 6) Convenções práticas
- Preferir TypeScript estrito e funções puras no Domain.
- Evitar side‑effects fora de Infrastructure.
- Quando em dúvida, parar e consultar ARCHITECTURE.md.

