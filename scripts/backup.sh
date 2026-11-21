#!/usr/bin/env bash
# Writes a compressed PostgreSQL backup and removes backups older than KEEP_DAYS (default 14).
# Usage: DATABASE_URL=postgresql://... ./scripts/backup.sh [directory]
# Uploaded files live in STORAGE_DIR (not in the database) and need copying too: see docs/DEPLOYMENT.md.
set -euo pipefail
umask 077 # a backup holds everyone's data: readable by its owner only
: "${DATABASE_URL:?Set DATABASE_URL to the database to back up}"
dir="${1:-backups}"; keep="${KEEP_DAYS:-14}"
mkdir -p "$dir"; chmod 700 "$dir"
file="$dir/aven-$(date -u +%Y%m%dT%H%M%SZ).sql.gz"
# Strip Prisma's ?schema=... which pg_dump does not understand.
if [ -n "${BACKUP_GPG_RECIPIENT:-}" ]; then # optional: encrypt for this GPG key, so a copied or leaked backup file is unreadable
  file="$file.gpg"
  pg_dump --no-owner --no-privileges "${DATABASE_URL%%\?*}" | gzip | gpg --batch --yes --encrypt --recipient "$BACKUP_GPG_RECIPIENT" > "$file.partial"
else
  pg_dump --no-owner --no-privileges "${DATABASE_URL%%\?*}" | gzip > "$file.partial"
fi
mv "$file.partial" "$file"
find "$dir" \( -name 'aven-*.sql.gz' -o -name 'aven-*.sql.gz.gpg' \) -mtime +"$keep" -delete
echo "Wrote $file"
