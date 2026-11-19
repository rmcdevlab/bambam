# BAMBAM

One Next.js application for the UI, RMC SSO and all implemented repair/settings APIs, backed by PostgreSQL. The Go backend has been removed.

```sh
cd frontend
npm run dev
```

Open http://localhost:3000. PostgreSQL must be available. Server secrets are in ignored `frontend/.env.local`; the original private configuration is backed up as ignored `.env.legacy.local`.

For a fresh checkout, install dependencies, configure `.env.local` from `.env.server.example`, and run `npm run db:migrate`. Full setup and production scheduling/storage instructions: [frontend/README.md](frontend/README.md).

Current requirements: [project](docs/PROJECT.md), [architecture](docs/shared/architecture.md), [SSO](docs/shared/integrations/sso.md), [design system](docs/shared/design-system.md), and each module's flows/API contract/screen specs. Historical changes remain in Git and [the decision log](docs/DECISIONS.md).

Verification was stopped at the owner's request. Migration and cleanup notes: [CR-056](docs/modules/repair/changes/CR-056-completion.md).
