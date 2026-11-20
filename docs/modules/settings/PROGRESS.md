# Settings — Progress

**Phase:** P5 Build · **Product stage:** R1 accepted, R2 pending · **Updated:** 2026-11-20

## Now

- Owner authorized committing/pushing branch `release` to verify GHCR deployment. Runner `bambam-rmc-prod` is online and enabled at boot; workflow builds on GitHub-hosted Ubuntu and deploys an immutable digest on the server. First Actions run 44654161312 completed successfully (commit 27ab6b9); the running image is pinned to the published GHCR digest.

- Owner-authorized deployment at https://rmc.cipcloud.net/bambam on 192.168.1.143; Docker app `bambam`, persistent photos and interval maintenance. Existing external DATABASE_URL and Superadmin roles retained; backup saved before deployment.
- SYNQ containers stopped and its deployment runner disabled; existing volumes retained.
- Subpath support covers links, browser history, images, APIs, QR links and SSO redirects/cookies. Root-path local development remains supported.
- CR-056 migration/cleanup retained. Product stages have not advanced through deployment.

## Done

- Existing schema/data and API contracts retained; SQL/migrations now live in `frontend/db/`.
- Local private config migrated to ignored `.env.local`, original private config backed up as `.env.legacy.local`.
- Superseded mockups/change reports and generated test/build artifacts removed; current screen specs/contracts/plans and original references retained.

## Next

- Owner to verify a complete SSO login with a real account; provider registration and browser handoff are verified, credential entry/token exchange were not exercised.
- Owner will upload replacement photos later; the 41 existing database photo records were retained without their missing files.
- Product R2 remains pending.

## Open issues

- Complete authenticated browser workflows were not run against production. Two database integration suites were skipped because CR056_TEST_DATABASE_URL was not configured; no production test data was created.
- Existing photo files are unavailable; replacement uploads are deferred by the owner.

## Deployment report — 2026-11-20

- Built: Docker/Traefik deployment and configurable `/bambam` hosting; recipe in `deploy/README.md`. Private runtime env lives only on the server, outside the image/build context.
- Acceptance: ✅ SYNQ stopped; ✅ production container healthy; ✅ existing database retained/backed up; ✅ public login/assets/API guards; ✅ SSO callback accepted and browser reaches Sign In; ✅ persistent photo writes; ⏳ real-account sign-in.
- Demo: open https://rmc.cipcloud.net/bambam and use an existing RMC SSO account (no test account created). Ops: `ssh root@192.168.1.143`, `cd /opt/rmc-deploy/bambam`, `docker compose ps` / `docker compose logs --tail 50 app`.
- Checks: lint/typecheck/production build passed; 18 server tests passed, 2 database suites skipped. Subpath proxy, SSO cookie/callback and QR checks passed; public browser smoke passed without runtime/asset errors. No full production e2e claimed.
- Shared code touched: `frontend/src/components/shared`, `frontend/src/lib`, server platform auth/HTTP, proxy and Next configuration. No backend schema or API contract change.
- Backup: `/opt/rmc-deploy/bambam/backups/before-deploy-20261120.dump` (private permissions). No commit, tag or push.

## Stage log

- Settings Stages 1–6, 4P, R1 and CR-008 history is recorded in `docs/DECISIONS.md`; old Git history was deleted at the owner's request.
- 2026-11-19: CR-056 migration/cleanup delivered. Included in the new initial baseline; no tag/push.
- 2026-11-20: Owner deployment request completed; SYNQ disabled, existing PostgreSQL reused, production SSO registration accepted. Full login remains an owner check; photos deferred.
- 2026-11-20: BAMBAM runner configured; release workflow/actionlint and deployment success/rollback/migration-failure checks passed locally. Owner authorized the first release push.

## Runner / release report — 2026-11-20

- Built: dedicated auto-starting runner at `/opt/actions-runner/bambam`; release push → GHCR build/publish → server deployment. No application/shared source changed beyond the earlier subpath deployment.
- Acceptance: ✅ runner online/idle; ✅ systemd enabled; ✅ release push triggered Actions; ✅ image published and deployed by digest; ✅ private database backup; ✅ healthy container/public login; ✅ registry credentials cleaned.
- Checks: actionlint and Bash syntax passed; isolated success, rollout failure, migration failure and public-check failure cases passed. Real Actions build/deploy succeeded: https://github.com/rmcdevlab/bambam/actions/runs/44654161312. Full SSO credential entry remains untested.
- Demo/ops: push trusted changes to `release`; inspect Actions and https://rmc.cipcloud.net/bambam. Recipe and recovery: `deploy/README.md`. SYNQ remains disabled.
