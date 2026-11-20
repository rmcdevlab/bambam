#!/usr/bin/env bash
set -Eeuo pipefail
umask 077

root=/opt/rmc-deploy/bambam
recipe=$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)
image=${BAMBAM_IMAGE:?BAMBAM_IMAGE is required}
if [[ ! $image =~ ^ghcr\.io/rmcdevlab/bambam@sha256:[a-f0-9]{64}$ ]]; then
  echo 'Expected the immutable BAMBAM GHCR image digest' >&2
  exit 1
fi

exec 9>"$root/.deploy.lock"
flock -w 300 9
cd "$root"
test -r env/production.env
test -d data/photos
previous=$(docker inspect bambam --format '{{.Config.Image}}' 2>/dev/null || true)
rollout_started=false
next="$root/compose.next.yaml"
compose=(docker compose --project-directory "$root" -f "$next")

rollback() {
  local result=$?
  trap - ERR
  if [[ $rollout_started == true && -n $previous ]]; then
    echo 'Deployment failed; restoring the previous application image' >&2
    BAMBAM_IMAGE="$previous" docker compose -f "$root/compose.yaml" up -d --no-build --no-deps --wait --wait-timeout 120 app || true
  fi
  echo 'Database migrations are not reversed automatically; the pre-deploy backup is retained.' >&2
  exit "$result"
}
trap rollback ERR

docker pull "$image"
install -m 600 "$recipe/compose.yaml" "$next"
export BAMBAM_IMAGE="$image"

stamp=$(date -u +%Y%m%dT%H%M%SZ)
backup="$root/backups/before-release-$stamp.dump"
docker run --rm --env-file "$root/env/production.env" postgres:17-alpine \
  sh -c 'pg_dump "$DATABASE_URL" -Fc' > "$backup.partial"
test -s "$backup.partial"
mv "$backup.partial" "$backup"
"${compose[@]}" run --rm --no-deps app npm run db:migrate

rollout_started=true
"${compose[@]}" up -d --no-build --no-deps --wait --wait-timeout 150 app
curl --fail --silent --show-error --max-time 20 --output /dev/null https://rmc.cipcloud.net/bambam/login
mv "$next" "$root/compose.yaml"
printf 'BAMBAM_IMAGE=%s\n' "$image" > "$root/.env.next"
mv "$root/.env.next" "$root/.env"
printf '%s\n' "$previous" > "$root/previous-image.txt"
printf 'Deployed %s\n' "$image"
