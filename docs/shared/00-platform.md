# Platform

Status: APPROVED (2026-11-19) — CR-056 migration authorized by the owner.

One Next.js 16.4.6 application serves the UI, RMC SSO, repair/settings APIs and scheduled maintenance. PostgreSQL remains external. Go, Gin, sqlc and the Goose binary are no longer required. (CR-056)

Current setup and commands: `frontend/README.md`.
Architecture and env settings: `docs/shared/architecture.md`.
Auth registration/provider behavior: `docs/shared/integrations/sso.md`.
API contracts: the corresponding module's `04-api-contract.md`.

The original platform was accepted on 2026-10-14 (`platform-stage-0`). Its retired Go implementation remains in Git history. The owner requested stopping further migration verification and removing generated artifacts on 2026-11-19. See `docs/modules/repair/changes/CR-056-completion.md`. (CR-056)
