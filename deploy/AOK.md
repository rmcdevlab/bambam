# Local development through the production API (CR-061)

`is_aok=true` runs local Next.js without PostgreSQL. Its server forwards approved
GET requests to production with `secret_key`; the browser never receives the key.
Uploads, ticket actions, settings writes, local SSO, role switching and maintenance
are denied. Existing user permissions and record visibility still apply.
Write controls may appear from those permissions, but attempts return
`403 AOK_READ_ONLY`; no production data is changed by those requests.

## Provision and activate

1. Select an existing non-demo production `employee_code`. Prefer an Admin for
   dashboard development; the key cannot select or impersonate another user.
2. From `frontend/`, run `npm run aok:issue -- <employee_code>`. It creates two
   ignored files with mode `0600`, without printing the key:
   - `.env.aok.local`: local raw key, mode and upstream URL.
   - `.env.aok.production.local`: production SHA-256 digest and principal code.
   Existing files are never overwritten. Both files are excluded from Docker.
3. Deploy the reviewed app through the existing release pipeline. Merge the two
   `AOK_*` entries into private `/opt/rmc-deploy/bambam/env/production.env`,
   replacing any old entries. Preserve other secrets and existing owner/group
   access. Never put the raw key or `is_aok=true` on production.
4. Recreate the production container using the installed immutable image and
   normal health checks. No migration is needed for this change.
5. Run `cd frontend && npm run dev:aok`, open `http://127.0.0.1:3000`.
   The launcher binds to loopback, clears `DATABASE_URL` and keeps existing
   `.env.local` unchanged. It forces real API mode with mocks/role switching off.

This task issued private files for the oldest existing non-demo Admin without
creating users or changing roles. The owner accepted the stage and requested activation on 2026-11-26. Local
`.env.local` is configured for API mode; `.env.before-aok.local` preserves its prior
settings. Production configuration has the matching digest/principal and
`is_aok=false`; release/live verification are recorded in module progress.

## Configuration

| Variable | Location | Meaning |
|---|---|---|
| `is_aok` | local server | `true`: API mode; absent/`false`: DB mode. Only `APP_ENV=development` may enable it. |
| `secret_key` | local server secret | Random 48-byte base64url key; never `NEXT_PUBLIC_*`. |
| `aok_api_url` | local server | Default `https://rmc.cipcloud.net/bambam/api/v1`; HTTPS, ends in `/api/v1`, no URL credentials/query/fragment. |
| `AOK_SECRET_KEY_HASH` | production | SHA-256 lowercase hex digest; absent disables keys. |
| `AOK_EMPLOYEE_CODE` | production | Existing non-demo user; effective permissions reload each request. |

Manual alternative: configure the local values in ignored `.env.local` and run
`npm run dev -- --hostname 127.0.0.1`. Always bind to loopback: hostname checks
alone do not authenticate remote clients. Never expose the local proxy publicly.

## Verification and errors

- API-mode startup has no DB/SSO dependency. Initialization, seeding and interval
  maintenance are skipped; migrations and accidental pool access throw.
- Only `/api/v1/me` and existing repair/settings GET routes accept keys.
- Production invalid/revoked keys return `401 UNAUTHENTICATED`. Locally this maps
  to `502 AOK_CREDENTIAL_REJECTED`, avoiding an expired-SSO-session redirect loop.
- Writes return `403 AOK_READ_ONLY`, including with a valid session cookie.
- Local cross-origin callers and non-loopback hosts are rejected.
- Redirects return `502 AOK_UPSTREAM_REDIRECT`; network/15-second timeout failures
  return `502 AOK_UPSTREAM_UNAVAILABLE`. No failure falls back to PostgreSQL.
- Other upstream statuses, envelopes and binary photos are preserved; upstream
  cookies and arbitrary browser credentials are never forwarded.
- Normal production browser SSO sessions retain existing behavior.

Checks: `npm run test:server -- aok.test.ts crypto.test.ts`, `npm run lint`,
`npm run typecheck`, `npm run build`.

## Revoke, rotate and return to DB mode

Remove both `AOK_*` entries on production and recreate the container to revoke.
There is one active key per deployment. To rotate, archive existing private local
files outside the repository, issue replacements, update production/recreate the
container, then restart local development. Old keys stop working.

Stop the dev server and restore `.env.before-aok.local` to `.env.local` (or restore
its `DATABASE_URL` and set `is_aok=false`) to return to database/SSO mode.
