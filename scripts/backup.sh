#!/usr/bin/env bash
# Writes a compressed PostgreSQL backup and removes backups older than KEEP_DAYS (default 14).
# Usage: DATABASE_URL=postgresql://... ./scripts/backup.sh [directory]
# Uploaded files live in STORAGE_DIR (not in the database) and need copying too: see docs/DEPLOYMENT.md.
set -euo pipefail
: "${DATABASE_URL:?Set DATABASE_URL to the database to back up}"
dir="${1:-backups}"; keep="${KEEP_DAYS:-14}"
mkdir -p "$dir"
file="$dir/aven-$(date -u +%Y%m%dT%H%M%SZ).sql.gz"
# Strip Prisma's ?schema=... which pg_dump does not understand.
pg_dump --no-owner --no-privileges "${DATABASE_URL%%\?*}" | gzip > "$file.partial"
mv "$file.partial" "$file"
find "$dir" -name 'aven-*.sql.gz' -mtime +"$keep" -delete
echo "Wrote $file"
