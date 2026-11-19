# BAMBAM application

The Next.js application serves the UI, RMC SSO, sessions and every implemented repair/settings API. PostgreSQL is the only database. No Go API, sqlc or Goose binary is required. (CR-056)

## Local development

1. Start PostgreSQL 17. The repository's `docker compose up -d db` is one option.
2. Run `npm ci` in this directory.
3. Configure ignored `.env.local` using `.env.server.example`. For this checkout, server settings have already been copied to `.env.local`; the original private configuration is preserved as ignored `.env.legacy.local`. Keep the same session/SSO secrets and database URL to retain existing sessions/data.
4. Run `npm run db:migrate`, then `npm run dev`.
5. Open <http://localhost:3000>. API paths remain `/api/v1/repair/*`, `/api/v1/settings/*` and `/api/v1/me`.

Existing migrated databases are supported: the Node runner reads `public.goose_db_version`, skips applied Up sections, and records each new migration transactionally. SQL files now live in `db/migrations/`; do not edit previously applied files. Named SQL queries live in `db/queries/`; after editing a query run `npm run db:generate` and commit the generated catalog too.

Photos default to `data/photos` locally. Set `PHOTO_STORAGE_DIR` to the existing persistent photo directory if uploads already exist elsewhere; relative paths are resolved from this directory. UAT/production require an explicit persistent directory. The old `backend/` directory has been removed; previous Go code remains in Git history.

## Production

Inject the server settings listed in `.env.server.example` and set `APP_ENV=production`. Configure `NEXT_PUBLIC_ROLE_SWITCHER=false` and `NEXT_PUBLIC_USE_MOCKS=false` at build time. Never put database/session/SSO secrets in `NEXT_PUBLIC_*` or committed env files.

```sh
npm ci
npm run db:migrate
npm run build
npm start
```

Use `npm start` as a long-running Node.js process with PostgreSQL access and persistent upload storage. `MAINTENANCE_SCHEDULER=interval` (default) runs maintenance every minute in server instrumentation. A PostgreSQL advisory lock prevents simultaneous maintenance from multiple instances. It closes due resolved tickets after the existing 72-hour window and removes expired sessions/unattached uploads older than 24 hours.

For a platform with an external scheduler, set `MAINTENANCE_SCHEDULER=external` and schedule `POST /api/internal/maintenance` every minute with `Authorization: Bearer <MAINTENANCE_JOB_SECRET>`. Use a separate random secret of at least 32 characters; when omitted, the server session secret is the bearer secret. Keep this server-only. Hosting itself has not been selected; serverless deployment also needs persistent/shared photo storage accessible through the configured directory.

The existing RMC SSO registered callback and logout redirect paths are unchanged. `GET /health/ready` still requires `Authorization: Bearer <SSO_CLIENT_SECRET>` and verifies PostgreSQL availability. Register production SSO URLs and run live-provider UAT before production rollout.

## Verification

```sh
npm run typecheck
npm run lint
npm run test:server
npm run build
```

Set `CR056_TEST_DATABASE_URL` to a disposable `bambam_cr056_test` PostgreSQL database to include platform integration tests. Set `MODULE_TEST_DATABASE_URL` to a separate disposable database named exactly `bambam_cr056_test_modules` to include module integration tests; **that module suite resets its own schemas**. Without these settings the integration suites are explicitly skipped.

Playwright and Atlas use one isolated Next.js server and a separate test database; see `../docs/shared/test-stack.md`. `npm run dev:session -- employee` creates a demo session locally in dev/UAT only, using the configured database. There is no production demo-session endpoint.

## Test artifact policy

Automatic Playwright trace, video and screenshot capture is off. `npm run test:e2e` uses temporary browser output and a per-run Next cache, then deletes both when it exits, including normal interruption. It does not leave a large test cache in the checkout. (CR-056, owner cleanup request 2026-11-19)
