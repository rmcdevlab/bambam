# Isolated test stack (CR-056)

Playwright and System Atlas share `frontend/e2e/test-stack.cjs`. The stack has one Next.js server and a separate PostgreSQL database. No Go API, sqlc, Goose or Docker CLI is needed by test/session/migration tooling. Docker remains one option for running PostgreSQL. (CR-056)

| | development | e2e / Atlas |
|---|---|---|
| Database | `DATABASE_URL` from ignored `frontend/.env.local` | `bambam_e2e @ localhost:5433`, override `E2E_DATABASE_URL` |
| UI + API | http://localhost:3000 | http://localhost:3100, override `E2E_PORT` |
| Next build directory | `.next` | `.next-e2e`, override `E2E_DIST_DIR` |
| Auth | RMC SSO | Node demo-session CLI; no real SSO |

The test adapter exports `API_URL = BASE_URL`, preserving the Atlas interface. It rejects the configured development database, displays a password-free destination label and verifies that the server accepts a session created in the test database. Test DB names must contain `_e2e` or `_test`; sessions/SQL fixtures use the same isolated DB. (CR-056)

## Prepare and run

```sh
# From the repository root, if using Docker for PostgreSQL:
docker compose up -d db
cd frontend
npm ci
npx playwright install chromium
npm run test:db
npm run test:e2e
```

For another PostgreSQL server, set `E2E_DATABASE_URL` explicitly. Local databases are created if missing; remote databases must already exist. Existing migrations are applied by the Node runner. Application data is never reset by this preparation command. (CR-056)

```sh
E2E_DATABASE_URL=postgres://user:password@localhost:55432/bambam_e2e E2E_PORT=3310 npm run test:e2e
```

Settings sample-people fixtures execute SQL through the Node PostgreSQL client against the guarded test DB; there is no container-specific `psql` dependency. `e2e/global-setup.ts` creates one demo session per role plus independent switcher sessions. (CR-056)

## Atlas and manual browsing

```sh
# Repository root:
node tools/atlas/cli.mjs serve
node tools/atlas/cli.mjs check
node tools/atlas/cli.mjs verify repair/F31
# Or, from frontend/:
npm run atlas
npm run test:browse -- technician
```

Atlas reads the shared adapter and launches the single Next.js server. The project-agnostic engine in `tools/atlas` is unchanged. Real SSO is registered on the dev origin, so the isolated browse command uses a demo session instead. (CR-056)

## Server integration tests

```sh
cd frontend
npm run test:server
CR056_TEST_DATABASE_URL=postgres://user:password@localhost:55432/bambam_cr056_test \
MODULE_TEST_DATABASE_URL=postgres://user:password@localhost:55432/bambam_cr056_test_modules \
npm run test:server
```

Without those variables, the corresponding PostgreSQL suites are explicitly skipped. Use disposable PostgreSQL 17 databases only. The platform suite verifies migration reruns/rollback, session compatibility, permissions and mocked-provider SSO. The module suite **resets schemas only in the explicitly named `bambam_cr056_test_modules` database** and verifies repair/settings transactions and maintenance. Never point either variable at application data. (CR-056)

## Troubleshooting

- Connection refused while preparing: start PostgreSQL and check its port/credentials.
- A dev-database guard fails: choose another test database; do not disable the guard.
- The server rejects a test session: another server is running on the chosen port or using another database; stop it or use another `E2E_PORT` / `E2E_DIST_DIR`.
- Missing live data on test pages: `NEXT_PUBLIC_USE_MOCKS` must be `false`. A fresh test DB has no repair tickets until tests create them.
- The recorded desktop/mobile tests share seeded demo identities; tests that mutate a seeded permission/role must restore it and avoid conflicting parallel writes. (CR-056)

## Artifact retention (owner request 2026-11-19)

Trace/video/screenshots are off by default. `npm run test:e2e` runs the browser output in a temporary directory and deletes its own Next.js test cache and temporary output when it exits. For this migration, the owner explicitly stopped further verification; previously recorded incomplete e2e results are not a final passing result. (CR-056)
