# Repair — Progress

**Phase:** P5 Build · **Product stage:** 6 of 8 next · **Updated:** 2026-11-22

## Now

- CR-057 (approved 2026-11-22): every unsaved-changes warning uses the browser dialog, on every form and form dialog (shared `use-unsaved-guard.ts` + `form-dialog.tsx`). Code, docs, e2e updated; typecheck/lint/build pass; e2e not run (no test DB here). Owner accepted 2026-11-22 (`repair-cr-057`).
- CR-058 (accepted 2026-11-22, `repair-cr-058`): S29 office-side decorative structures removed; อาคาร TrialMix switched off (migration `20261122000001` applied 2026-11-22 to the database in `frontend/.env`).
- 2026-11-22 S29 mascot follow-up (6.8 s and amendment 2 order kept): 72 poses restored at 362×362 px each (v4 was blurry at 148×148), six native-resolution `bam-mascot-admin-hd-v5-{1..6}.webp` sheets, 3.41 MB total; generation prompts in `frontend/scripts/assets/admin-mascot-v5.json`. All sheets decode before playback; 24 ms overlaps keep eyes/stripes crisp instead of full-interval ghosting. Previous compositor card flight, body lean and deferred WebGL scene retained. Desktop/mobile mock browser checks at 2× pixel density play all 72 frames across all six sheets; reduced motion and one-sheet decode failure pass; visual comparison confirms sharper detail. Lint/typecheck/build pass (existing photo-storage build warnings); no shared code changed. Scroll-away/motion-change/hidden-tab checks passed before this HD follow-up. Waiting for owner review; not deployed.
- 2026-11-22 S29 pose fix: v5 sheets changed BAM's size per sheet (~±4%), ground line 340–352 px, and sheet 6 drifted ~8 px per column → `bam-mascot-admin-hd-v6-{1..6}.webp` (same slots, uniform scale per sheet, feet on one ground line/centre; recipe in `attachments/admin-hero-motion/README.md`). Play order per phase in `admin-hero.tsx`: greeting no longer raises/drops/raises the arm (slot 3 skipped), unrolling no longer snaps back (slot 23 skipped). The HTML sign that covered the 12 plan-lifting poses is gone; the card grows from the blueprint in BAM's hands. Mock browser check of the whole sequence; typecheck/lint pass. v5 files now unused (owner to decide on deletion). Waiting for owner review.

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

- Owner to verify a complete SSO login with a real account; provider registration and browser handoff are verified, credential entry/token exchange were not exercised.
- Owner will upload replacement photos later; the 41 existing database photo records were retained without their missing files.
- Product Stage 6 remains pending.

## Open issues

- CR-057: run full e2e on the test stack; iOS Safari shows no refresh / tab-close warning (browser limit).
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

- Product stages through 5C and accepted UI changes through CR-055 are recorded in `docs/DECISIONS.md`; old Git history was deleted at the owner's request.
- 2026-11-19: CR-056 migration and cleanup delivered. Details: `changes/CR-056-completion.md`. Included in the new initial baseline; no tag/push.
- 2026-11-20: Owner deployment request completed; SYNQ disabled, existing PostgreSQL reused, production SSO registration accepted. Full login remains an owner check; photos deferred.
- 2026-11-20: BAMBAM runner configured; release workflow/actionlint and deployment success/rollback/migration-failure checks passed locally. Owner authorized the first release push.

## Runner / release report — 2026-11-20

- Built: dedicated auto-starting runner at `/opt/actions-runner/bambam`; release push → GHCR build/publish → server deployment. No application/shared source changed beyond the earlier subpath deployment.
- Acceptance: ✅ runner online/idle; ✅ systemd enabled; ✅ release push triggered Actions; ✅ image published and deployed by digest; ✅ private database backup; ✅ healthy container/public login; ✅ registry credentials cleaned.
- Checks: actionlint and Bash syntax passed; isolated success, rollout failure, migration failure and public-check failure cases passed. Real Actions build/deploy succeeded: https://github.com/rmcdevlab/bambam/actions/runs/44654161312. Full SSO credential entry remains untested.
- Demo/ops: push trusted changes to `release`; inspect Actions and https://rmc.cipcloud.net/bambam. Recipe and recovery: `deploy/README.md`. SYNQ remains disabled.
