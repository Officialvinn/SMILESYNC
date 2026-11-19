#!/bin/sh
# Restores a backup OVER the live data. This replaces every case, user and
# audit entry with the backup's copy. Stop and think before running it.
#   scripts/restore.sh backups/<timestamp> --yes-replace-live-data
set -eu
. ./.env
dir=${1:?usage: scripts/restore.sh backups/<timestamp> --yes-replace-live-data}
[ "${2:-}" = "--yes-replace-live-data" ] || { echo "Refusing: add --yes-replace-live-data to confirm"; exit 1; }
( cd "$dir" && shasum -a 256 -c SHA256SUMS )
db="${POSTGRES_DB:-smilesync}"

docker compose stop api
docker compose exec -T db psql -U "$POSTGRES_USER" -d postgres -v ON_ERROR_STOP=1 -c "DROP DATABASE \"$db\" WITH (FORCE)" -c "CREATE DATABASE \"$db\""
docker compose exec -T db pg_restore -U "$POSTGRES_USER" -d "$db" --exit-on-error < "$dir/smilesync.dump"
volume=$(docker volume ls -q | grep -E '(^|_)images$' | head -1)
docker run --rm -v "$volume":/data -v "$PWD/$dir":/in:ro alpine:3.22 sh -c 'rm -rf /data/* && tar -xzf /in/images.tar.gz -C /data && chown -R 1000:1000 /data'
docker compose up -d api
echo "Restored $dir"
