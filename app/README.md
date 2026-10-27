# الشمس للإلكترونيات الحديثة — نظام إدارة الصيانة

Next.js 16 (App Router) + TypeScript strict + Prisma 7 + PostgreSQL 17 + Tailwind 4. واجهة عربية RTL.
النطاق المنفَّذ والمؤجَّل والافتراضات: [docs/SCOPE.md](docs/SCOPE.md).

## تشغيل التطوير
```bash
docker run -d --name elshams-db -e POSTGRES_USER=elshams -e POSTGRES_PASSWORD=elshams_dev -e POSTGRES_DB=elshams -p 5433:5432 postgres:17
cp .env.example .env            # اضبط DATABASE_URL و SESSION_SECRET
npm ci && npx prisma migrate deploy
ADMIN_USERNAME=admin ADMIN_PASSWORD='كلمة-قوية' npx prisma db seed   # أول مدير (+ أنواع الأجهزة)
SEED_DEMO=1 ... npx prisma db seed   # اختياري، للتطوير فقط: مستخدمون تجريبيون بكلمة Demo@12345
npm run dev
```
## الاختبارات
- `npm test` — تكاملي على قاعدة `elshams_test` (الدورة الكاملة، المخزون والتزامن، idempotency، الصلاحيات، الضمان).
- `npm run build && npx next start -p 3400` ثم `npx playwright test` — E2E عبر المتصفح (يحتاج مستخدم admin/tech1 من الـseed التجريبي).

## الإنتاج
`cp .env.prod.example .env.prod` ← املأ `DOMAIN` و`DB_PASSWORD` و`SESSION_SECRET` (`openssl rand -base64 48`)
ثم `docker compose --env-file .env.prod up -d --build` (Caddy يوفّر HTTPS تلقائيًا). الـmigrations تُطبَّق عند إقلاع التطبيق.
- أول مدير: `docker compose run --rm -e ADMIN_USERNAME=... -e ADMIN_PASSWORD=... app npx prisma db seed` ثم غيّر كلمة المرور من شاشة المستخدمين.
- الصحة: `GET /api/health` (يفحص قاعدة البيانات).
- الترقية: اسحب الكود ← `docker compose up -d --build` (الـmigrations تلقائية؛ خذ نسخة احتياطية قبلها).

## النسخ الاحتياطي والاستعادة
`scripts/backup.sh [مجلد]` (pg_dump بصيغة custom) و`scripts/restore.sh ملف.dump [قاعدة]` — الاستعادة افتراضيًا إلى قاعدة اختبار منفصلة.
جُرِّبت فعليًا: الأعداد والأرصدة بعد الاستعادة مطابقة للأصل. لا توجد مرفقات ملفية في هذا الإصدار (انظر النطاق).
جدول النسخ: أضف `scripts/backup.sh` إلى cron يوميًا وانسخ المجلد خارج الجهاز؛ اختبر الاستعادة دوريًا.

## البنية
- `src/server/services/*` منطق العمل الوحيد (معاملات، أقفال صفوف، تحقق صلاحيات). `src/server/api.ts` جدول REST رقيق فوقها.
- `src/server/workflow.ts` جدول الانتقالات؛ الانتقالات «النظامية» (اعتماد عرض، نتيجة اختبار، تسليم) لا تُنفَّذ يدويًا.
- المال Decimal(12,2)، المخزون Decimal(12,3)، الترقيم عبر جدول Sequence بـ`INSERT … ON CONFLICT`.
