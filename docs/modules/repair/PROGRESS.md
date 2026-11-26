# Repair — Progress

**Phase:** P5 Build · **Product stage:** 6 of 8 next · **Updated:** 2026-11-26

## Now

- CR-061 (accepted and deployed 2026-11-26, `repair-cr-061`): read-only local API mode `is_aok=true`, private key/hash files issued, existing Admin principal, no local DB/SSO/jobs. Local `.env.local` uses API mode with DATABASE_URL cleared; private backup retained. Production hash/principal active with is_aok=false; authenticated local/production reads and write guards pass. Activation: `deploy/AOK.md`.
- CR-060 amendment 2 (owner 2026-11-24; built, waiting for owner review): S29 pose changes are smoothed with cut points and baked transforms at each sheet boundary (one frame, no blending). The S01 login button now reads `เข้าสู่ระบบ` (was `เข้าสู่ระบบด้วย RMC SSO`). Frame order was verified in the browser and typecheck passes. `/atlas sync repair` still lists the old button name (`docs/atlas/modules/repair.json`).
- Maintenance interval: new env `MAINTENANCE_INTERVAL`, default `10m`; the dev `.env` uses `1m`. Shared code touched: `server/platform/config.ts`, `jobs.ts`. e2e F07 and F21 pass (18 tests).
- D-181 (owner request 2026-11-24; built, waiting for owner review): every mascot placement now uses the snow leopard (navy / royal-blue techwear): `components/shared/mascot.tsx` poses, login, S06 actions sprite, settings role art, QR label board, and the S29 admin hero sheets `bam-leopard-admin-{1..6}.webp`. The tiger files are archived in `docs/shared/style/references/mascot-tiger-archive/`. Provenance: `frontend/scripts/assets/mascot-leopard-v1.json` and `attachments/admin-hero-motion/README.md`. Checks: typecheck plus screenshots of every placement. e2e was not run for this asset swap, at the owner's instruction. Shared code touched: `components/shared/mascot.tsx`.
- Auto-close window (owner request 2026-11-24): new env `REPAIR_AUTO_CLOSE_AFTER` (default `72h`). Production always uses 72 h; outside production it can be shortened for testing. The local `frontend/.env` has `5m`, so restart the dev server to apply it and remove the line after testing. e2e pins `72h`. Shared code touched: `server/platform/config.ts`. The unit test was added, but it can't run on Node 20.11 (jose ESM). The same logic was verified with a tsx script.
- CR-059 (accepted 2026-11-24, `repair-cr-059`): (1) favicon / apple-icon = BAM logo tile; (2) S07 progress updates — technician / Admin post a message (required) + 0–5 photos while in repair / reworking; cards in the timeline, latest one in the band, band button + dashed timeline button, dialog with confirm; PDF prints them. New permission `repair.ticket.update_progress`, migration `20261123000001` (applied 2026-11-23 to the database in `frontend/.env`; permission seeded to admin, super_admin, technician), endpoint #37. Typecheck / lint pass; mock-mode screenshots checked (technician, reporter, admin; desktop + phone); 2026-11-23 fix: `POST tickets/:id/progress` added to the route allowlist (`src/server/platform/routes.ts`; it returned 404 before); `F21-cr059-progress-updates.spec.ts` 4/4 pass (desktop + mobile) on the Docker test DB.
- CR-057 (approved 2026-11-22): every unsaved-changes warning uses the browser dialog, on every form and form dialog (shared `use-unsaved-guard.ts` + `form-dialog.tsx`). Code, docs, e2e updated; typecheck/lint/build pass; e2e not run (no test DB here). Owner accepted 2026-11-22 (`repair-cr-057`).
- CR-058 (accepted 2026-11-22, `repair-cr-058`): S29 office-side decorative structures removed; อาคาร TrialMix switched off (migration `20261122000001` applied 2026-11-22 to the database in `frontend/.env`).
- CR-060 amendment (owner request 2026-11-24; built, waiting for visual review): owner rejected the articulated rig. Restored full-character v6 sprite images on ONE canvas, cleared completely before each frame; no pose crossfade, rear layer, moving body parts or residual silhouette. Smiling two-wave greeting -> unfold and briefly read -> look up/lift -> open palm towards the problem card, 5.1 s. All six sheets decode first; data waits on reading frame 41; final frame 71. Rejected rig source/asset/prompt removed. Scope and timing: `changes/CR-060.md`.
- CR-060 amendment checks: lint/typecheck/production build pass (existing photo-storage tracing warnings only). Seven Chromium mock cases pass: desktop/mobile single-frame rendering and both dialogs, reduced motion, one failed sheet, delayed overview hold/resume, motion preference change, hidden-tab event. Compared 62 desktop + 76 mobile displayed frames pixel-for-pixel against clean source cells: no residual pixels, one canvas, no pose opacity animations. Wave/read/final images inspected. Shared surface: hero-only `globals.css`; no shared component behavior or API/DB change. Demo: `cd frontend`, `npm run dev`, open `/` as Admin; local mocks: `NEXT_PUBLIC_USE_MOCKS=true`, `localStorage["bambam.mockRole"]="admin"`, reload. Not committed/deployed; no production browser verification.
- Owner authorized committing/pushing branch `release` to verify GHCR deployment. Runner `bambam-rmc-prod` is online and enabled at boot; workflow builds on GitHub-hosted Ubuntu and deploys an immutable digest on the server. First Actions run 44654161312 completed successfully (commit 27ab6b9); the running image is pinned to the published GHCR digest.
- Owner-authorized deployment at https://rmc.cipcloud.net/bambam on 192.168.1.143; Docker app `bambam`, persistent photos and interval maintenance. Existing external DATABASE_URL and Superadmin roles retained; backup saved before deployment.
- SYNQ containers stopped and its deployment runner disabled; existing volumes retained.
- Subpath support covers links, browser history, images, APIs, QR links and SSO redirects/cookies. Root-path local development remains supported.
- CR-056 migration/cleanup retained. Product stages have not advanced through deployment.

## Done

- Native server code in `frontend/src/server/`, SQL in `frontend/db/`; existing schema/data/migration history preserved.
- Next.js 16.4.6 patch, native test/session tooling, default recording disabled and automatic test-cache cleanup.
- Removed legacy Go code, large QA/build artifacts, old prototypes/mockups and superseded change reports; original building plans/photos and current specifications retained.
- Before verification was stopped: 40 server tests passed and production build passed; full e2e was incomplete. No final verification is claimed.

## Next

- CR-061: restart with `cd frontend && npm run dev:aok`, http://127.0.0.1:3000. Launcher binds loopback and clears DATABASE_URL; existing Admin principal, no new test account. See `deploy/AOK.md` for restore/rotation.
- Owner to verify a complete SSO login with a real account; provider registration and browser handoff are verified, credential entry/token exchange were not exercised.
- Owner will upload replacement photos later; the 41 existing database photo records were retained without their missing files.
- Product Stage 6 remains pending.

## Open issues

- e2e repair 2026-11-23 (owner: fix every failing test): app fixes — `POST contractors` / `PUT contractors/:id` / `POST contractor-types` return 403 `NOT_TECHNICIAN` again (contract #14/#16/#17; the Node port had `FORBIDDEN`); S06 phone cards show `· ทีมแก้เอง` / `คุณติดตามเคสนี้` after the ticket no. like the table (CR-021). Test fixes — F23 site = 15 blocks, no TrialMix (CR-058; its CR wrongly said no test referenced it); F31 scrolls the plan into view, waits for the chip to settle, moves into ท่าหลวง 3; F21 waits for the ช่างผู้รับผิดชอบ list (CR-034) before submitting; `fillPlace` uses `submitReady` and waits 30 s for S03's first compile. Known flaky under 4 workers (pass on retry, CI has `retries: 1`): F06 BR-F06-2 ordering (shared demo reporter), F30 AC5. Reset `bambam_e2e` when it grows (~500 tickets per full run slow the duplicate check).
- Local e2e: machine Node is 20.11.1 but `scripts/test-env.cjs` needs `util.parseEnv` (package engines ≥20.18.1); tests ran with a scratch parseEnv shim via `NODE_OPTIONS`. Upgrade Node to ≥20.18.1 (22 LTS) to run `npm test` directly.
- CR-059: migration `20261123000001` applied to the `frontend/.env` database (2026-11-23); the release deploy runs migrations on its own database; `/atlas sync repair` still to do.
- `npm run db:generate` on a Windows checkout with CRLF SQL files rewrites every query in `queries.json` with `\r\n`; CR-059 regenerated with LF-normalized input (only `TouchTicket` added).
- CR-057: run full e2e on the test stack; iOS Safari shows no refresh / tab-close warning (browser limit).
- Complete authenticated browser workflows were not run against production. Two database integration suites were skipped because CR056_TEST_DATABASE_URL was not configured; no production test data was created.
- Existing photo files are unavailable; replacement uploads are deferred by the owner.

## Stage log

- 2026-11-20 deployment evidence: public login/assets/API guards/SSO handoff and persistent photo writes passed; 18 server checks passed, 2 DB suites skipped; lint/typecheck/build passed. Real-account SSO and production workflows remain unverified; missing photo files retained for owner replacement. Shared UI/lib/platform/proxy/config touched. Backup: `/opt/rmc-deploy/bambam/backups/before-deploy-20261120.dump`. Ops/rollback: `deploy/README.md`.
- 2026-11-20 release evidence: actionlint/Bash and isolated success/rollback/migration-failure/public-check cases passed; Actions run 44654161312 deployed an immutable GHCR digest, registry credentials cleaned. Runner auto-start enabled; SYNQ disabled and volumes retained. No product stage advancement.

- Product stages through 5C and accepted UI changes through CR-055 are recorded in `docs/DECISIONS.md`; old Git history was deleted at the owner's request.
- 2026-11-19: CR-056 migration and cleanup delivered. Details: `changes/CR-056-completion.md`. Included in the new initial baseline; no tag/push.
- 2026-11-20: Owner deployment request completed; SYNQ disabled, existing PostgreSQL reused, production SSO registration accepted. Full login remains an owner check; photos deferred.
- 2026-11-20: BAMBAM runner configured; release workflow/actionlint and deployment success/rollback/migration-failure checks passed locally. Owner authorized the first release push.

## CR-061 activation report — 2026-11-26

- Owner accepted the stage and explicitly requested configuring local/production secrets via SSH. Local `.env.local` has is_aok=true, secret_key and upstream URL; DATABASE_URL cleared; mode-0600 `.env.before-aok.local` preserves prior values. Production retains DB mode and SSO, with matching hash/principal only (no raw key), existing ownership and private env backup.
- Release: code commit `1d990e1`, tag `repair-cr-061`; Actions https://github.com/rmcdevlab/bambam/actions/runs/45769384084 succeeded; healthy immutable image `sha256:d1c7b53fe2cc189b1b80265e7b5b41acf2a17c17da8cbaf03b7b742c469cf978`. Pipeline database backup and migration/readiness checks passed.
- Live checks: production/local me, buildings, tickets and overview 200; absent/invalid keys 401; production/local POST ticket 403; keyed auth/dev GET 403. Normal login 200 and SSO initiation 302. Activation regression tests: 25 passed. No production business records changed by smoke checks. Temporary local check server/cache removed.
- Validation/shared scope: lint/typecheck/production build passed (existing photo tracing warnings); prior full server run 27 passed/2 DB suites skipped, activation regression 25 passed. Shared changes: `src/lib/aok-mode.ts`, server platform auth/config/HTTP/DB, proxy, instrumentation and CLIs; no shared UI or schema changes. Remaining gaps: full browser e2e and real-account SSO token exchange were not run.
