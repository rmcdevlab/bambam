# Architecture — cross-cutting conventions

<!-- Shared by every module and by both agents. Folder layouts live in backend/AGENTS.md and frontend/AGENTS.md. -->

## Application runtime (CR-056)

Approved 2026-11-19. One Next.js 16.4.6 application now serves the UI, auth, repair and settings APIs; PostgreSQL remains external. The Go backend directory has been removed; previous versions remain in Git history. (CR-056)

- Server code: `frontend/src/server/platform/`, `repair/`, `settings/`, protected with `server-only`. Route Handlers → service functions → named, parameterized PostgreSQL queries; transactions use one `pg` client. The shared audit/query/error helpers are transport-independent. (CR-056)
- Native Route Handlers serve `/api/auth/*`, `/api/v1/*`, `/health/ready` and the internal maintenance endpoint. API rewrites, `API_INTERNAL_URL` and `NEXT_BACKEND_ENABLED` have been removed. (CR-056)
- API contracts, PostgreSQL schema/data, session cookies and migration versions remain compatible. There are no schema-generating ORM or data resets in the migration path. (CR-056)
- `frontend/db/queries/` contains the named SQL sources; `npm run db:generate` emits the static query catalog. `frontend/db/migrations/` retains existing SQL Up/Down files; `npm run db:migrate` uses `public.goose_db_version`, an advisory lock and a transaction per migration. No Go/Goose binary is required. (CR-056)
- Server startup validates configuration, assigns configured Superadmins and initializes dev/UAT demo users. `proxy.ts` is only a UI gate; each native API resolves the session and reloads effective permissions. (CR-056)
- Photos use `PHOTO_STORAGE_DIR` (development default `frontend/data/photos`, explicit persistent directory required in UAT/production). Existing files stay accessible when this points to their original directory. Do not store uploads in `public/`. (CR-056)
- The Node server's instrumentation runs maintenance every minute by default; a PostgreSQL advisory lock prevents overlapping processes. `MAINTENANCE_SCHEDULER=external` instead requires a scheduled `POST /api/internal/maintenance` every minute with a server-only bearer secret. Due tickets close after the existing 72-hour window, expired sessions are removed, and unattached uploads expire after 24 hours. Hosting has not been selected; deployment must provide reliable scheduling and persistent/shared photo storage. (CR-056)

## API conventions

- Base path: `/api/v1/<module>/<resource>` (shared: `/api/v1/health`, `/api/v1/me`)
- JSON field names: `camelCase`
- Success: `{ "data": <object|array>, "meta": { "page": 1, "pageSize": 20, "total": 134 } }` (`meta` only for lists)
- Error: `{ "error": { "code": "ITEM_NOT_FOUND", "message": "debug text in English", "fields": { "qty": "MUST_BE_POSITIVE" } } }`
  - `code` is stable, UPPER_SNAKE, documented in `04-api-contract.md`.
  - The frontend maps `code` → Thai message from the screen spec. Backend `message` is never shown to users.
- Status codes: 400 bad input · 401 not logged in · 403 no permission · 404 not found · 409 conflict · 422 business rule failed · 500 unexpected
- Dates/times: RFC 3339 in UTC over the wire; display in Asia/Bangkok.
- Money: ✏️ decide once (e.g. decimal string `"1234.50"`) and record in DECISIONS.md.
- Lists: `?page=&pageSize=&sort=field:asc&q=` ; default pageSize 20, max 100.

## Database

- PostgreSQL. One schema per module (`<module_key>`), plus `platform` for shared tables (users, roles, audit_log).
- Every table: `id` (uuid or bigint — decide in DECISIONS.md), `created_at`, `updated_at`; `created_by` when the screen shows it.
- Soft delete only when a flow requires restore/audit; otherwise hard delete.
- Migrations: compatible Goose SQL in `frontend/db/migrations/`, executed by the Node migration CLI (CR-056), filename `YYYYMMDDHHMMSS_<module>_<change>.sql`, always with a `-- +goose Down`.

## Auth

- SSO details: `docs/shared/integrations/sso.md` (the single source).
- Frontend gate: `src/proxy.ts`. API gate: native session/permission guards in `frontend/src/server/platform/` (CR-056). Never rely on the frontend gate alone.
- The browser talks only to the Next.js origin. Next.js owns OIDC login/callback/logout and `bam_session` (httpOnly, Secure, SameSite=Lax); `platform.sessions` stores only the token hash. (CR-056)
- `APP_ENV`: `development` · `uat` · `production`. Next.js loads its environment conventionally; local secrets stay in ignored `.env.local`, production secrets are injected by deployment. (CR-056)
- Permissions are checked in the **service** layer. The role set is global (below); each module's `01-users.md` holds its permission matrix against these roles.

### Roles and permissions (D-003, D-004, D-049, D-111; rewritten in settings Stage 6)

- SSO gives identity only. A person's role is their row in `platform.user_roles` (keyed by `employee_code`, SSO claim `USER`); no row = `employee` (first login creates the user as `employee`). One role per person, shared by every module.
- **Roles are data** (`platform.roles`): stable `key` (`employee` · `housekeeper_lead` · `security_lead` · `technician` · `admin` · `super_admin`, custom roles `r_` + 8 hex), editable Thai `name`. `employee` and `super_admin` are system roles (cannot be deleted); `super_admin` is locked (cannot be edited, has every permission). A role with real users cannot be deleted (demo users go with it). Superadmin manages roles, the matrix and people's roles in ตั้งค่าระบบ (settings S24 / S25).
- **Permissions are keys** registered in `frontend/src/server/platform/catalog.json`, with effective catalog order in `permissions.ts`. Keys are stored in `platform.role_permissions`; `platform.permission_matrix` provides version-conflict protection. Settings keys are editable/stored since CR-006; they are no longer fixed by role name. `super_admin` always receives every known key. (CR-056)
- **Checks use keys, never role names**: server permission guards on routes and in services (CR-056); FE `can(me, PERM.x)` for menus only (never for security). Permissions load on **every request** with the current role/permission data (CR-056), so matrix and role changes apply on the next request without logging out.
- `GET /api/v1/me` returns the user, `role`, `roleName` and the effective `permissions`.
- `SUPER_ADMIN_EMPLOYEE_CODES` (comma-separated employee codes, per environment): those people are `super_admin` at server start and at every login, and their role cannot be changed on screen (`ROLE_LOCKED`). At least one code per environment before UAT; without any, the server logs a warning when no user has `super_admin`.
- Every settings write appends to `platform.audit_log` in the same transaction with `data = { entityName, parentName?, changes }` (settings F30); the dev role switch writes `dev.role_switch` rows that ประวัติการเปลี่ยนแปลง does not list.

### Role switcher — dev/UAT only (D-005)

- Purpose: preview each role's UI with real backend permission checks.
- Mechanism: switch to a seeded `demo_user` (one per role, realistic Thai names, own sample tickets). Never changes a real user's role.
- Server: `POST /api/v1/dev/role-switch { "role": "technician" }` → replaces the session with that demo user. The route returns 404 unless `APP_ENV != production` **and** `ROLE_SWITCHER_ENABLED=true`; demo users are seeded only in those environments.
- Frontend: floating "ดูในบทบาท…" control in the app shell, rendered only when `NEXT_PUBLIC_ROLE_SWITCHER=true` (build-time, so production bundles do not contain it). Always shows a visible banner "โหมดทดสอบ: กำลังดูในบทบาท <role>".
- Every switch is written to the audit log.

## Environments

How dev → production switching works: **code is identical; only env vars differ.** The deploy pipeline provides production values. Nobody edits code or config files to "switch to prod" before a commit.

| Variable | Where | development | production |
|---|---|---|---|
| `APP_ENV` | Next.js server | `development` (`uat` for UAT) | `production` |
| `DATABASE_URL` | server secret | PostgreSQL URL | injected secret |
| `SSO_*` | server | existing RMC dev registration | injected secrets + registered prod URLs |
| `APP_SESSION_SECRET` | server secret | separate random secret, at least 32 chars | injected; distinct from SSO client secret |
| `APP_SESSION_TTL` | server | `12h` | configured duration, default `12h` |
| `SSO_CLOCK_SKEW` | server | `60s` | provider leeway, max `10m` |
| `PHOTO_STORAGE_DIR` | server | default `data/photos` from `frontend/` | required persistent/shared directory |
| `SUPER_ADMIN_EMPLOYEE_CODES` | server | optional comma-separated employee codes | initial Superadmin codes for that environment |
| `ROLE_SWITCHER_ENABLED` | server | `true` for dev/UAT | ignored in production |
| `MAINTENANCE_SCHEDULER` | server | `interval` | `interval` for a persistent Node process; `external` for a managed scheduler |
| `MAINTENANCE_JOB_SECRET` | server secret | optional | optional separate secret, at least 32 chars; otherwise session secret is used for the internal job endpoint |
| `NEXT_PUBLIC_API_BASE_URL` | browser build | `/api/v1` | `/api/v1` |
| `NEXT_PUBLIC_USE_MOCKS` | browser build | `false` for the real app | `false` |
| `NEXT_PUBLIC_ROLE_SWITCHER` | browser build | `true` | `false` |

This table replaces the Go-specific deployment variables (`HTTP_PORT`, `GIN_MODE`, CORS and `API_INTERNAL_URL`). Server config is validated in `frontend/src/server/platform/config.ts`; non-secret public config remains in `src/lib/env.ts`. Document new variables here and in `.env.server.example`; never expose server secrets through `NEXT_PUBLIC_*`. (CR-056)
