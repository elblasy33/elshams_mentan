# الشمس للإلكترونيات الحديثة — نظام إدارة الصيانة

## تجربة سريعة (Docker)
```bash
docker compose up -d --build
```
افتح http://localhost:3000 (غيّر المنفذ بـ`APP_PORT=8080 docker compose up -d --build`).
أول تشغيل يطبّق قاعدة البيانات ويزرع **بيانات تجريبية للعرض** (6 أوامر صيانة بحالات مختلفة، عملاء، قطع غيار، دفعات، ضمان).

| المستخدم | الدور | كلمة المرور |
|---|---|---|
| admin | مدير النظام | Admin@12345 |
| manager | مدير | Demo@12345 |
| reception | استقبال | Demo@12345 |
| tech1 | فني | Demo@12345 |
| stock | أمين مخزن | Demo@12345 |
| cashier | كاشير | Demo@12345 |
| auditor | مراجع (قراءة فقط) | Demo@12345 |

> هذه النسخة للتجربة فقط (كلمات مرور معروفة). إعادة ضبط البيانات: `docker compose down -v`.

## الإنتاج
استخدم `docker-compose.prod.yml` (بدون بيانات تجريبية، مع HTTPS عبر Caddy) — التفاصيل في [app/README.md](app/README.md).
النطاق والافتراضات: [app/docs/SCOPE.md](app/docs/SCOPE.md).
