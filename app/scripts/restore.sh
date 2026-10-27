#!/usr/bin/env bash
# استعادة نسخة في قاعدة بيانات (افتراضيًا قاعدة اختبار elshams_restore_test — لا تمس الإنتاج).
# الاستخدام: ./restore.sh ملف.dump [اسم_القاعدة]
set -euo pipefail
FILE="$1"; DBNAME="${2:-elshams_restore_test}"
CONTAINER="${DB_CONTAINER:-elshams-db}"; DBUSER="${DB_USER:-elshams}"
docker exec "$CONTAINER" psql -U "$DBUSER" -d postgres -c "DROP DATABASE IF EXISTS $DBNAME" -c "CREATE DATABASE $DBNAME"
docker exec -i "$CONTAINER" pg_restore -U "$DBUSER" -d "$DBNAME" --no-owner < "$FILE"
echo "تمت الاستعادة إلى $DBNAME"
