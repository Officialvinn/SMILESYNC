#!/bin/sh
# Proves a backup can be restored, without touching the live data: restores the
# database into a temporary database, compares row counts, then drops it.
#   scripts/verify-backup.sh backups/<timestamp>
set -eu
. ./.env
dir=${1:?usage: scripts/verify-backup.sh backups/<timestamp>}
( cd "$dir" && shasum -a 256 -c SHA256SUMS )

db="${POSTGRES_DB:-smilesync}"
tmp=restore_check_$$
psql() { docker compose exec -T db psql -U "$POSTGRES_USER" -v ON_ERROR_STOP=1 "$@"; }
psql -d postgres -qc "CREATE DATABASE $tmp"
trap 'psql -d postgres -qc "DROP DATABASE IF EXISTS $tmp" >/dev/null' EXIT

docker compose exec -T db pg_restore -U "$POSTGRES_USER" -d "$tmp" --no-owner --exit-on-error < "$dir/smilesync.dump"

count='SELECT (SELECT count(*) FROM users)||'"'"' users, '"'"'||(SELECT count(*) FROM cases)||'"'"' cases, '"'"'||(SELECT count(*) FROM oral_images)||'"'"' images, '"'"'||(SELECT count(*) FROM audit_log)||'"'"' audit entries'"'"
restored=$(psql -d "$tmp" -tAc "$count")
images=$(tar -tzf "$dir/images.tar.gz" | grep -c '^./images/.*\.bin$' || true)
echo "Restored copy: $restored"
echo "Image files in backup: $images"
echo "Live database now: $(psql -d "$db" -tAc "$count")"
echo "OK: the backup restores. The live database may have grown since the backup was taken."
