#!/usr/bin/env bash
# نسخة احتياطية: قاعدة البيانات (pg_dump) + المرفقات إن وُجدت. الاستخدام: ./backup.sh [مجلد_الوجهة]
set -euo pipefail
DEST="${1:-./backups}"; STAMP=$(date +%Y%m%d-%H%M%S); mkdir -p "$DEST"
CONTAINER="${DB_CONTAINER:-elshams-db}"; DBUSER="${DB_USER:-elshams}"; DBNAME="${DB_NAME:-elshams}"
docker exec "$CONTAINER" pg_dump -U "$DBUSER" -Fc "$DBNAME" > "$DEST/db-$STAMP.dump"
[ -d "${UPLOADS_DIR:-./uploads}" ] && tar czf "$DEST/files-$STAMP.tgz" -C "${UPLOADS_DIR:-./uploads}" . || true
echo "تم: $DEST/db-$STAMP.dump"
