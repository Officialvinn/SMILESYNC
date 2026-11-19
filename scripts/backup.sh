#!/bin/sh
# Back up the SmileSync data: the PostgreSQL database and the encrypted image
# volume, taken together so they match. Run from the repository root while
# the stack is up:   scripts/backup.sh
#
# Patient names and photos in the backup stay encrypted with PATIENT_DATA_KEY,
# but ages, counties and notes are readable. Keep backups on encrypted storage
# and keep PATIENT_DATA_KEY somewhere separate: without it, names and photos
# cannot be recovered.
set -eu
. ./.env
stamp=$(date -u +%Y%m%dT%H%M%SZ)
dir="backups/$stamp"
mkdir -p "$dir"
chmod 700 backups "$dir"

echo "Database..."
docker compose exec -T db pg_dump -U "$POSTGRES_USER" -d "${POSTGRES_DB:-smilesync}" --format=custom > "$dir/smilesync.dump"

echo "Encrypted images..."
volume=$(docker volume ls -q | grep -E '(^|_)images$' | head -1)
docker run --rm -v "$volume":/data:ro -v "$PWD/$dir":/out alpine:3.22 tar -czf /out/images.tar.gz -C /data .

( cd "$dir" && shasum -a 256 smilesync.dump images.tar.gz > SHA256SUMS )
chmod 600 "$dir"/*
echo "Backup written to $dir"
echo "Check it with: scripts/verify-backup.sh $dir"
