/* بيانات تجريبية للعرض فقط — تُنشأ عبر خدمات النظام نفسها فتمر بكل القواعد (حالات، مخزون، دفعات). */
import { prisma } from "../src/server/db";
import { makeCtx } from "../src/server/context";
import { createCustomer } from "../src/server/services/customers";
import { createOrder, transition, updateOrder } from "../src/server/services/orders";
import { createQuotation, sendQuotation, approveQuotation } from "../src/server/services/quotations";
import { createPart, receiveStock, issuePart } from "../src/server/services/inventory";
import { createPayment } from "../src/server/services/payments";
import { recordTest } from "../src/server/services/quality";
import { deliver } from "../src/server/services/delivery";

export async function seedDemo() {
  if ((await prisma.customer.count()) > 0) return console.log("demo data skipped (data exists)");
  const u = async (username: string) => makeCtx(await prisma.user.findUniqueOrThrow({ where: { username } }));
  const [mgr, rec, tech, stock] = [await u("manager"), await u("reception"), await u("tech1"), await u("stock")];
  const T = Object.fromEntries((await prisma.deviceType.findMany()).map((t) => [t.code, t.id]));

  const parts: Record<string, string> = {};
  for (const [code, name, price, cost, qty] of [
    ["PB-001", "لوحة طاقة شاشة 43 بوصة", 650, 380, 6], ["BL-002", "شريط إضاءة خلفية LED", 420, 240, 10],
    ["TC-003", "لوحة T-CON", 800, 500, 3], ["RM-004", "ريموت كنترول أصلي", 120, 60, 20], ["HD-005", "كابل HDMI", 45, 18, 2],
  ] as const) {
    const p = await createPart(mgr, { code, name, salePrice: price, reorderLevel: 3, location: "رف A" });
    await receiveStock(stock, { partId: p.id, qty, unitCost: cost, reference: "رصيد افتتاحي تجريبي" });
    parts[code] = p.id;
  }

  const cust = async (name: string, phone: string, type = "INDIVIDUAL") => (await createCustomer(rec, { name, phone, type, address: "القاهرة — بيانات تجريبية" })).id;
  const [c1, c2, c3, c4] = [
    await cust("أحمد محمود (تجريبي)", "01000000001"), await cust("محل النور للإلكترونيات (تجريبي)", "01000000002", "SHOP"),
    await cust("شركة الأمل التجارية (تجريبي)", "01000000003", "COMPANY"), await cust("منى السيد (تجريبي)", "01000000004"),
  ];
  const mk = (customerId: string, type: string, brand: string, model: string, complaint: string, extra: object = {}) =>
    createOrder(rec, { customerId, newDevice: { typeId: T[type], brand, model, serial: `DEMO-${brand}-${Math.floor(Math.random() * 9000 + 1000)}` }, complaint, technicianId: tech.userId, expectedAt: new Date(Date.now() + 3 * 86400000), ...extra });
  const toInspect = async (id: string) => { await transition(rec, id, "AWAITING_INSPECTION"); await transition(tech, id, "INSPECTING"); };
  const toQuote = async (id: string, diag: string) => { await updateOrder(tech, id, { diagnosis: diag }); await transition(tech, id, "AWAITING_QUOTE"); };
  const quote = async (id: string, lines: object[]) => { const q = await createQuotation(tech, id, { lines }); await sendQuotation(tech, q.id); return q; };
  const approve = (qid: string) => approveQuotation(rec, qid, { channel: "PHONE", contactAt: new Date(), note: "موافقة هاتفية (تجريبي)" });

  // 1) استلام جديد بعربون
  await mk(c1, "TV", "Samsung", "UA43", "الشاشة لا تعمل ولا يوجد ضوء", { deposit: { amount: 100 } });
  // 2) قيد الفحص
  const o2 = await mk(c2, "RECEIVER", "Strong", "SRT", "لا يستقبل إشارة"); await toInspect(o2.id);
  // 3) في انتظار موافقة العميل
  const o3 = await mk(c3, "TV", "LG", "43LM", "صورة بخطوط أفقية", { deposit: { amount: 200 } });
  await toInspect(o3.id); await toQuote(o3.id, "عطل في لوحة T-CON");
  await quote(o3.id, [{ type: "INSPECTION", description: "رسوم فحص", qty: 1, unitPrice: 50 }, { type: "PART", description: "لوحة T-CON", partId: parts["TC-003"], qty: 1 }, { type: "LABOR", description: "مصنعية", qty: 1, unitPrice: 250 }]);
  // 4) جاري الإصلاح مع قطعة مصروفة
  const o4 = await mk(c1, "TV", "Sony", "KDL", "لا يعمل بعد انقطاع الكهرباء", { deposit: { amount: 300 } });
  await toInspect(o4.id); await toQuote(o4.id, "احتراق لوحة الطاقة");
  const q4 = await quote(o4.id, [{ type: "PART", description: "لوحة طاقة", partId: parts["PB-001"], qty: 1 }, { type: "LABOR", description: "مصنعية", qty: 1, unitPrice: 200 }]);
  await approve(q4.id); await issuePart(tech, { orderId: o4.id, partId: parts["PB-001"], qty: 1 }); await transition(tech, o4.id, "REPAIRING");
  // 5) جاهز للتسليم بمتبقٍ
  const o5 = await mk(c4, "REMOTE", "Samsung", "BN59", "الأزرار لا تستجيب");
  await toInspect(o5.id); await toQuote(o5.id, "أزرار تالفة");
  const q5 = await quote(o5.id, [{ type: "LABOR", description: "تغيير مطاط الأزرار", qty: 1, unitPrice: 150 }]);
  await approve(q5.id); await transition(tech, o5.id, "REPAIRING");
  await updateOrder(tech, o5.id, { repairNotes: "تغيير مطاط الأزرار وتنظيف الدائرة" }); await transition(tech, o5.id, "AWAITING_TEST");
  await recordTest(tech, o5.id, { items: [{ name: "الأزرار", result: "PASS" }, { name: "الإرسال", result: "PASS" }, { name: "البطارية", result: "NA" }] });
  await transition(tech, o5.id, "READY_FOR_DELIVERY");
  await createPayment(rec, { orderId: o5.id, kind: "PAYMENT", amount: 50 });
  // 6) تم التسليم مع ضمان
  const o6 = await mk(c2, "TV", "TCL", "40S", "إضاءة خلفية ضعيفة", { deposit: { amount: 100 } });
  await toInspect(o6.id); await toQuote(o6.id, "شريط LED تالف");
  const q6 = await quote(o6.id, [{ type: "PART", description: "شريط إضاءة LED", partId: parts["BL-002"], qty: 1 }, { type: "LABOR", description: "مصنعية", qty: 1, unitPrice: 180 }]);
  await approve(q6.id); await issuePart(tech, { orderId: o6.id, partId: parts["BL-002"], qty: 1 }); await transition(tech, o6.id, "REPAIRING");
  await updateOrder(tech, o6.id, { repairNotes: "تغيير شريط الإضاءة" }); await transition(tech, o6.id, "AWAITING_TEST");
  await recordTest(tech, o6.id, { items: [{ name: "التشغيل", result: "PASS" }, { name: "الصورة", result: "PASS" }] });
  await transition(tech, o6.id, "READY_FOR_DELIVERY");
  await deliver(rec, o6.id, { receiverName: "صاحب المحل", collect: { amount: 500 }, warrantyMonths: 3 });
  console.log("demo data created");
}
