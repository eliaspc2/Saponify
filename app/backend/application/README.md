# Backend Application

This layer coordinates domain + infrastructure to execute use cases.
It must not contain domain rules or UI logic.
No direct persistence logic; delegate to Infrastructure services/repositories.
Examples: use cases, backup orchestration, recipe domain service.
Non-examples: calculator formulas, storage parsing, UI state.
