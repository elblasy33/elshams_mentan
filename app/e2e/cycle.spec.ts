import { expect, test, type Page } from "@playwright/test";

const U = Date.now().toString().slice(-6);
const click = (p: Page, name: string) => p.getByRole("button", { name }).first().click();
async function ok(p: Page, text: string | RegExp) { await expect(p.getByText(text).first()).toBeVisible({ timeout: 15000 }); }

test("الدورة الكاملة من الاستلام حتى التسليم والضمان", async ({ page: p }) => {
  await p.goto("/login");
  await p.getByLabel("اسم المستخدم").fill("admin");
  await p.getByLabel("كلمة المرور").fill("Admin@12345");
  await click(p, "دخول");
  await ok(p, "لوحة التحكم");

  // قطعة غيار + استلام مخزني
  await p.goto("/inventory");
  await click(p, "قطعة جديدة");
  await p.locator('input[name="code"]').fill("E2E-" + U);
  await p.locator('input[name="name"]').fill("لوحة طاقة اختبار");
  await p.locator('input[name="salePrice"]').fill("300");
  await click(p, "إضافة");
  await ok(p, "تمت إضافة القطعة");
  await p.reload();
  await click(p, "استلام مخزني");
  await p.locator('select[name="partId"]').selectOption({ label: `E2E-${U} · لوحة طاقة اختبار` });
  await p.locator('input[name="qty"]').fill("5");
  await p.locator('input[name="unitCost"]').fill("120");
  await click(p, "تسجيل الاستلام");
  await ok(p, "تم تسجيل الاستلام");

  // أمر صيانة جديد مع عميل جديد وعربون
  await p.goto("/orders/new");
  await click(p, "عميل جديد");
  await p.locator('input[name="name"]').first().fill("عميل E2E " + U);
  await p.locator('input[name="phone"]').first().fill("0109" + U + "9");
  await click(p, "حفظ واختيار");
  await ok(p, "2. الجهاز");
  await p.locator('input[name="brand"]').fill("Samsung");
  await p.locator('input[name="serial"]').fill("SN" + U);
  await p.locator('textarea[name="complaint"]').fill("الشاشة لا تعمل وصوت طقطقة");
  await p.locator('input[name="deposit"]').fill("100");
  await click(p, "حفظ وفتح الأمر");
  await expect(p).toHaveURL(/\/orders\/[a-z0-9]+$/);
  await ok(p, /SHS-\d{4}-\d{5}/);
  await ok(p, "عربون مقدم");

  // إسناد وفحص
  await click(p, "تحويل لقائمة الفحص");
  await ok(p, "في انتظار الفحص");
  await p.locator("select").filter({ hasText: "إسناد لفني" }).selectOption({ label: "فني ١ (تجريبي)" });
  await p.waitForTimeout(800);
  await click(p, "بدء الفحص");
  await ok(p, "جاري الفحص");
  // الانتقال دون تشخيص مرفوض من الخادم
  await click(p, "إنهاء الفحص وطلب التسعير");
  await ok(p, "سجّل التشخيص الفني");
  await p.locator('textarea[name="diagnosis"]').fill("عطل في دائرة الطاقة");
  await click(p, "حفظ");
  await ok(p, "تم الحفظ");
  await click(p, "إنهاء الفحص وطلب التسعير");
  await ok(p, "في انتظار عرض السعر");

  // عرض السعر
  await click(p, "عرض جديد / تعديل");
  await p.getByLabel("السعر").first().fill("50");
  await click(p, "بند");
  await p.getByPlaceholder("الوصف").nth(1).fill("مصنعية إصلاح");
  await p.getByLabel("السعر").nth(1).fill("200");
  await click(p, "بند");
  const row = p.locator("form .grid").nth(2);
  await row.locator("select").first().selectOption("PART");
  await row.locator("select").nth(1).selectOption({ label: `E2E-${U} · لوحة طاقة اختبار` });
  await click(p, "حفظ العرض");
  await ok(p, "تم إنشاء العرض");
  await click(p, "إرسال للعميل");
  await ok(p, "في انتظار موافقة العميل");
  // لا صرف قبل الموافقة: لا يوجد زر صرف
  await expect(p.getByRole("button", { name: "صرف", exact: true })).toHaveCount(0);
  await click(p, "تسجيل موافقة العميل");
  await click(p, "تأكيد الموافقة");
  await ok(p, "جاهز للإصلاح");
  await ok(p, "550.00 ج.م");

  // صرف قطعة وإصلاح
  await click(p, "صرف");
  await ok(p, "تم الصرف");
  await click(p, "بدء الإصلاح");
  await ok(p, "جاري الإصلاح");
  await p.locator('textarea[name="repairNotes"]').fill("استبدال لوحة الطاقة");
  await click(p, "حفظ");
  await click(p, "إنهاء الإصلاح وإرسال للاختبار");
  await ok(p, "الاختبار النهائي");

  // فشل ثم نجاح
  await p.locator("select.rounded").nth(1).selectOption("FAIL");
  await click(p, "اعتماد نتيجة الاختبار");
  await ok(p, "سبب الفشل مطلوب");
  await p.locator('input[name="notes"]').fill("خطوط في الصورة");
  await click(p, "اعتماد نتيجة الاختبار");
  await ok(p, "إعادة للإصلاح");
  await click(p, "إعادة الإصلاح");
  await click(p, "إنهاء الإصلاح وإرسال للاختبار");
  await click(p, "اعتماد نتيجة الاختبار");
  await ok(p, "تم الإصلاح");
  await click(p, "جاهز للتسليم");
  await ok(p, "التسليم");

  // التسليم مع تحصيل المتبقي 450
  await p.locator('input[name="receiver"]').fill("العميل نفسه");
  p.once("dialog", (d) => d.accept());
  await click(p, "تأكيد التسليم");
  await ok(p, "تم التسليم");
  await ok(p, "مدفوع بالكامل");
  await ok(p, "الضمان");

  // الطباعة بالعربية
  const href = await p.getByRole("link", { name: "إيصال استلام" }).getAttribute("href");
  const pr = await p.context().newPage();
  await pr.goto(href!);
  await ok(pr, "إيصال استلام جهاز");
  await ok(pr, "الشمس");
  await pr.pdf({ path: `e2e/intake-${U}.pdf`, format: "A4", printBackground: true });
  await pr.screenshot({ path: `e2e/intake-${U}.png`, fullPage: true });
});

test("الصلاحيات: الفني لا يرى التحصيلات ولا يسجل دفعة عبر API", async ({ page: p, request }) => {
  await p.goto("/login");
  await p.getByLabel("اسم المستخدم").fill("tech1");
  await p.getByLabel("كلمة المرور").fill("Demo@12345");
  await click(p, "دخول");
  await ok(p, "لوحة التحكم");
  await expect(p.getByRole("link", { name: "التحصيلات" })).toHaveCount(0);
  const res = await p.request.post("/api/payments", { data: { orderId: "x", amount: 5 } });
  expect(res.status()).toBe(403);
  const rf = await p.request.post("/api/stock/receive", { data: { partId: "x", qty: 1, unitCost: 1 } });
  expect(rf.status()).toBe(403);
  void request;
});
