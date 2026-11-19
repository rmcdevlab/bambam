# Settings — Progress

**Phase:** P5 Build · **Product stage:** R1 accepted, R2 pending · **Updated:** 2026-11-19

## Now

- Owner requested environment-only credentials: Docker PostgreSQL reads ignored `.env.local`; Playwright/Atlas use isolated `.env.test.local` with no database/signing-secret fallback. Synthetic tokens are generated at runtime. Templates contain no passwords/secrets. No tests/build run.

- Owner requested Playwright for testing: `npm test` runs browser flows; `npm run test:server` now runs existing server assertions with Playwright and named steps. Temporary output is deleted; recordings remain off. No tests/build run for this change.

- Additional owner cleanup: removed regenerated Next cache, e2e photo fixtures, superseded UI reference screenshots and obsolete Go CI. Owner authorized deleting all local Git history and starting a new main-branch baseline; origin is retained without pushing. No tests/build run.

- CR-056 implemented: settings APIs, users/roles/permissions, audit, locations/assets/master data and QR label operations now run in Next.js.
- Go removed; the application starts with `cd frontend && npm run dev` and PostgreSQL.
- Owner requested stopping verification and removing generated/unnecessary files. Final changes were not re-tested.

## Done

- Existing schema/data and API contracts retained; SQL/migrations now live in `frontend/db/`.
- Local private config migrated to ignored `.env.local`, original private config backed up as `.env.legacy.local`.
- Superseded mockups/change reports and generated test/build artifacts removed; current screen specs/contracts/plans and original references retained.

## Next

- Product R2 remains pending; no additional UI scope was introduced by migration.
- Resume verification only if requested. Report: `../repair/changes/CR-056-completion.md`.

## Open issues

- Final migration/cleanup changes are unverified at the owner's request; live SSO and deployment remain unverified.
- Hosting is undecided; production needs persistent storage and reliable scheduling.

## Stage log

- Settings Stages 1–6, 4P, R1 and CR-008 history is recorded in `docs/DECISIONS.md`; old Git history was deleted at the owner's request.
- 2026-11-19: CR-056 migration/cleanup delivered. Included in the new initial baseline; no tag/push.
