# BAMBAM production deployment

Public URL: https://rmc.cipcloud.net/bambam
Server: `192.168.1.143`, installation root: `/opt/rmc-deploy/bambam`.

## Release pipeline

Push to branch `release` to run `.github/workflows/release.yml`:

1. A GitHub-hosted runner builds `deploy/Dockerfile` using `frontend/` as context.
2. The workflow publishes `ghcr.io/rmcdevlab/bambam:sha-<commit>` and `:release`.
3. Runner `bambam-rmc-prod` pulls the exact published image digest.
4. `deploy/release.sh` backs up the existing database, runs pending migrations,
   starts the image, waits for authenticated readiness and checks public login.
5. On rollout failure the previous application image is restored. Database
   migrations are never reversed automatically; the backup is retained.

Build and deploy jobs use the temporary `GITHUB_TOKEN` for GHCR. No PAT, SSH key
or application/database secret is needed in GitHub Actions. The self-hosted job
only runs for `release`; pull-request workflows are not enabled here. Deploys
are serialized by both workflow concurrency and a server-side lock.

## Server configuration

- Runner directory: `/opt/actions-runner/bambam`, user: `github-runner`.
- Service: `actions.runner.rmcdevlab-bambam.bambam-rmc-prod.service`, enabled
  at boot, with runner automatic updates enabled.
- Runner labels: `self-hosted`, `Linux`, `X64`, `bambam`, `production`.
- `env/production.env`: existing private server settings, group-readable by the
  deployment user, outside the Docker build context and image. DATABASE_URL
  continues to use the existing external PostgreSQL database.
- `data/photos/`: persistent bind mount, writable by container UID 1000.
- `backups/`: private pre-deployment PostgreSQL dumps; monitor storage usage.
- `.env`: current BAMBAM_IMAGE digest, saved only after successful deployment.
- `previous-image.txt`: prior application image, for manual recovery.
- `compose.yaml`: installed release recipe. Next.js performs interval maintenance.

Use `docker compose ps` or `docker compose logs --tail 50 app` from the
installation root. To roll back application code manually, export BAMBAM_IMAGE
from `previous-image.txt`, then run:

```sh
docker compose up -d --no-build --no-deps --wait --wait-timeout 150 app
```

Check database compatibility before rolling back code after schema changes.
The pipeline does not update Traefik rules. `traefik.yaml` is installed at
`/opt/rmc-portal/traefik/config/dynamic/bambam.yaml`; the external Docker network
is `rmc-portal-network`. Server-local access is `127.0.0.1:3300`. The dedicated
security middleware allows same-origin QR camera scanning.

## SSO and paths

Client `bam` production callback/logout registration was accepted on 2026-11-20:

- Callback: https://rmc.cipcloud.net/bambam/api/auth/callback/rmc-sso
- Post logout: https://rmc.cipcloud.net/bambam/signed-out
- Readiness: https://rmc.cipcloud.net/bambam/health/ready (bearer authentication)

Build-time public values are set in the Dockerfile. Local root-path development
uses an empty NEXT_PUBLIC_BASE_PATH. A different deployment path requires a
rebuild with matching public API URLs and SSO configuration.

SYNQ remains stopped with its deployment runner disabled and its volumes intact.
Do not restore SYNQ as part of BAMBAM deployment.
