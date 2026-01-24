# Noviessence Architecture

Layer diagram (top to bottom):
Frontend -> Orchestrator -> Backend/Application -> Backend/Domain -> Backend/Shared
Backend/Application -> Backend/Infrastructure

Roles:
- Frontend: UI only, no business rules, no OpenAI.
- Orchestrator: coordination/wiring only (AppController).
- Backend/Application: use cases and orchestration of domain + infrastructure.
- Backend/Domain: pure rules and calculations, no IO.
- Backend/Shared: cross-cutting contracts/utilities.
- Backend/Infrastructure: IO, storage, crypto, sync, integrations.

Examples:
- Belongs in Domain: calculator formulas, normalizers.
- Belongs in Infrastructure: LocalStorageRepository, sync providers.
- Belongs in Application: BackupComposer, CalculatorUseCase.

Non-examples:
- Domain must not read localStorage or call OpenAI.
- Infrastructure must not include domain rules.

If you do not know which layer something belongs to, do not write code.
