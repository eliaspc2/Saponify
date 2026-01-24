# Backend Domain

This layer contains pure domain rules, normalization, and calculation logic.
It must not import Infrastructure (storage/sync/crypto) or Orchestrator.
No IO, no network, no localStorage, no OpenAI.
Examples: CalculatorEngine, Ingredient/Recipe/Client normalizers.
Non-examples: repositories, sync providers, file IO, settings persistence.
