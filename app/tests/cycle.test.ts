import { beforeAll, describe, expect, it } from "vitest";
import { prisma } from "@/server/db";
import { createCustomer } from "@/server/services/customers";
import { createOrder, transition, updateOrder, getOrder, financeOf } from "@/server/services/orders";
import { createQuotation, sendQuotation, approveQuotation } from "@/server/services/quotations";
import { createPayment, refund } from "@/server/services/payments";
import { createPart, receiveStock, issuePart, returnPart } from "@/server/services/inventory";
import { recordTest } from "@/server/services/quality";
import { deliver } from "@/server/services/delivery";
import { mkWorld } from "./helpers";

let w: Awaited<ReturnType<typeof mkWorld>>;
let customerId: string;

beforeAll(async () => {
  w = await mkWorld();
  customerId = (await createCustomer(w.reception, { name: "عميل اختبار", phone: "01000000001" })).id;
});

async function newOrder(extra: object = {}) {
  return createOrder(w.reception, {
    customerId,
    newDevice: { typeId: w.type.id, brand: "Samsung", model: "UA43", serial: "SN-" + Math.random() },
    complaint: "لا يعمل", technicianId: w.tech.userId, ...extra,
  });
}
const idem = () => crypto.randomUUID();

describe("TEST 1+2: الاستلام والعربون", () => {
  it("ينشئ أمرًا بترقيم تسلسلي وسجل حالة وعربون بلا ازدواج", async () => {
    const key = idem();
    const o = await newOrder({ deposit: { amount: 100 }, idempotencyKey: key });
    expect(o.number).toMatch(/^SHS-\d{4}-\d{5}$/);
    const full = await getOrder(w.reception, o.id);
    expect(full.history).toHaveLength(1);
    expect(full.payments).toHaveLength(1);
    expect(full.finance.net.toString()).toBe("100");
    expect(full.finance.status).toBe("DEPOSIT_ONLY");
    // إعادة إرسال نفس الدفعة لا تكرر
    const p1 = await createPayment(w.cashier, { orderId: o.id, kind: "DEPOSIT", amount: 50, idempotencyKey: "k1" });
    const p2 = await createPayment(w.cashier, { orderId: o.id, kind: "DEPOSIT", amount: 50, idempotencyKey: "k1" });
    expect(p2.duplicate).toBe(true);
    expect(p2.payment.id).toBe(p1.payment.id);
    expect(await prisma.payment.count({ where: { orderId: o.id } })).toBe(2);
  });

  it("الترقيم لا يتكرر تحت التزامن", async () => {
    const orders = await Promise.all(Array.from({ length: 8 }, () => newOrder()));
    expect(new Set(orders.map((o) => o.number)).size).toBe(8);
  });

  it("يمنع عميلًا مكررًا بنفس الهاتف", async () => {
    await expect(createCustomer(w.reception, { name: "آخر", phone: "01000000001" })).rejects.toMatchObject({ code: "DUPLICATE_CUSTOMER" });
  });
});

describe("دورة كاملة TEST 3,4,6,7", () => {
  it("استلام ← فحص ← تسعير ← موافقة ← صرف ← إصلاح ← فشل اختبار ← إعادة ← تسليم", async () => {
    const part = await createPart(w.admin, { code: "P-100", name: "لوحة طاقة", salePrice: 300 });
    await receiveStock(w.stock, { partId: part.id, qty: 10, unitCost: 100 });
    await receiveStock(w.stock, { partId: part.id, qty: 10, unitCost: 200 }); // متوسط 150

    const o = await newOrder({ deposit: { amount: 200 } });
    // لا يمكن بدء فحص قبل الانتقال لانتظار الفحص
    await expect(transition(w.tech, o.id, "INSPECTING")).rejects.toMatchObject({ code: "INVALID_TRANSITION" });
    await transition(w.reception, o.id, "AWAITING_INSPECTION");
    await transition(w.tech, o.id, "INSPECTING");
    // لا تسعير دون تشخيص
    await expect(transition(w.tech, o.id, "AWAITING_QUOTE")).rejects.toThrow(/التشخيص/);
    await updateOrder(w.tech, o.id, { diagnosis: "عطل في دائرة الطاقة" });
    await transition(w.tech, o.id, "AWAITING_QUOTE");

    const q1 = await createQuotation(w.tech, o.id, {
      lines: [{ type: "PART", description: "لوحة طاقة", partId: part.id, qty: 1 }, { type: "LABOR", description: "مصنعية", qty: 1, unitPrice: 200 }],
    });
    expect(q1.total.toString()).toBe("500");
    // الفني لا يغيّر سعر القطعة
    await expect(createQuotation(w.tech, o.id, { lines: [{ type: "PART", description: "x", partId: part.id, qty: 1, unitPrice: 1 }] })).rejects.toMatchObject({ status: 403 });
    // (أُنشئ عرض فاشل لم يحفظ) أعد إنشاء العرض الصحيح
    const q = await createQuotation(w.tech, o.id, { lines: [{ type: "PART", description: "لوحة طاقة", partId: part.id, qty: 1 }, { type: "LABOR", description: "مصنعية", qty: 1, unitPrice: 200 }] });
    await sendQuotation(w.tech, q.id);
    // لا صرف ولا إصلاح قبل الموافقة
    await expect(issuePart(w.tech, { orderId: o.id, partId: part.id, qty: 1 })).rejects.toThrow();
    await approveQuotation(w.reception, q.id, { channel: "PHONE", contactAt: new Date() });
    expect((await prisma.serviceOrder.findUniqueOrThrow({ where: { id: o.id } })).status).toBe("READY_TO_REPAIR");

    // صرف أكثر من المعتمد مرفوض
    await expect(issuePart(w.tech, { orderId: o.id, partId: part.id, qty: 2 })).rejects.toMatchObject({ code: "NOT_APPROVED" });
    await issuePart(w.tech, { orderId: o.id, partId: part.id, qty: 1 });
    let p = await prisma.sparePart.findUniqueOrThrow({ where: { id: part.id } });
    expect(p.onHand.toString()).toBe("19");

    await transition(w.tech, o.id, "REPAIRING");
    // عطل إضافي: لا يمكن صرف بند غير معتمد
    await expect(issuePart(w.tech, { orderId: o.id, partId: part.id, qty: 1 })).rejects.toMatchObject({ code: "NOT_APPROVED" });
    await expect(transition(w.tech, o.id, "AWAITING_TEST")).rejects.toThrow(/الأعمال المنفذة/);
    await updateOrder(w.tech, o.id, { repairNotes: "تغيير لوحة الطاقة" });
    await transition(w.tech, o.id, "AWAITING_TEST");
    // لا انتقال يدوي إلى تم الإصلاح
    await expect(transition(w.tech, o.id, "REPAIRED")).rejects.toMatchObject({ code: "SYSTEM_TRANSITION" });

    // TEST 6: فشل ثم إعادة
    await recordTest(w.tech, o.id, { items: [{ name: "التشغيل", result: "PASS" }, { name: "الصورة", result: "FAIL" }], notes: "خطوط في الصورة" });
    expect((await prisma.serviceOrder.findUniqueOrThrow({ where: { id: o.id } })).status).toBe("REWORK");
    await transition(w.tech, o.id, "REPAIRING");
    await transition(w.tech, o.id, "AWAITING_TEST");
    await recordTest(w.tech, o.id, { items: [{ name: "التشغيل", result: "PASS" }, { name: "الصورة", result: "PASS" }] });
    const tests = await prisma.qualityTest.findMany({ where: { orderId: o.id }, orderBy: { round: "asc" } });
    expect(tests.map((t) => t.result)).toEqual(["FAIL", "PASS"]);
    await transition(w.tech, o.id, "READY_FOR_DELIVERY");

    // TEST 7: التسليم مع متبقٍ
    const f = await financeOf(prisma, o.id);
    expect(f.balance.toString()).toBe("300");
    await expect(deliver(w.reception, o.id, { receiverName: "العميل" })).rejects.toMatchObject({ code: "BALANCE_DUE" });
    await expect(deliver(w.reception, o.id, { receiverName: "العميل", overrideReason: "ثقة" })).rejects.toMatchObject({ status: 403 });
    // تحصيل زائد مرفوض
    await expect(createPayment(w.cashier, { orderId: o.id, amount: 301 })).rejects.toMatchObject({ code: "OVERPAYMENT" });
    const res = await deliver(w.reception, o.id, { receiverName: "العميل", collect: { amount: 300 }, warrantyMonths: 3 });
    expect(res.warranty).toBeTruthy();
    await expect(deliver(w.reception, o.id, { receiverName: "العميل" })).rejects.toMatchObject({ code: "ALREADY_DELIVERED" });
    await expect(transition(w.reception, o.id, "CANCELLED", "x")).rejects.toThrow();

    // التكلفة بالمتوسط المرجح (150)
    const op = await prisma.orderPart.findFirstOrThrow({ where: { orderId: o.id } });
    expect(op.costTotal.toString()).toBe("150");
    // كل الانتقالات في السجل
    const hist = await prisma.orderStatusHistory.count({ where: { orderId: o.id } });
    expect(hist).toBeGreaterThan(12);
  });
});

describe("TEST 4/5: المخزون والتزامن", () => {
  it("لا يتجاوز الرصيد عند صرف متزامن، ولا يكرر عند إعادة الإرسال", async () => {
    const part = await createPart(w.admin, { code: "P-200", name: "ذاكرة", salePrice: 50 });
    await receiveStock(w.stock, { partId: part.id, qty: 3, unitCost: 10 });
    // 5 أوامر معتمدة، كل منها يصرف 1، الرصيد 3 فقط
    const orders = [];
    for (let i = 0; i < 5; i++) {
      const o = await newOrder();
      await prisma.serviceOrder.update({ where: { id: o.id }, data: { status: "AWAITING_QUOTE" } });
      const q = await createQuotation(w.tech, o.id, { lines: [{ type: "PART", description: "ذاكرة", partId: part.id, qty: 1 }] });
      await sendQuotation(w.tech, q.id);
      await approveQuotation(w.reception, q.id, { channel: "IN_PERSON", contactAt: new Date() });
      orders.push(o);
    }
    const results = await Promise.allSettled(orders.map((o) => issuePart(w.tech, { orderId: o.id, partId: part.id, qty: 1 })));
    expect(results.filter((r) => r.status === "fulfilled")).toHaveLength(3);
    expect((await prisma.sparePart.findUniqueOrThrow({ where: { id: part.id } })).onHand.toString()).toBe("0");

    // نفس مفتاح الـidempotency بالتوازي لا ينتج حركتين
    await receiveStock(w.stock, { partId: part.id, qty: 10, unitCost: 10 });
    const failedIdx = results.findIndex((r) => r.status === "rejected");
    const o = orders[failedIdx];
    const key = idem();
    const dup = await Promise.allSettled([1, 2, 3].map(() => issuePart(w.tech, { orderId: o.id, partId: part.id, qty: 1, idempotencyKey: key })));
    expect(dup.every((r) => r.status === "fulfilled")).toBe(true);
    expect(await prisma.stockMovement.count({ where: { idempotencyKey: key } })).toBe(1);
    // مجموع الحركات = الرصيد
    const sum = await prisma.stockMovement.aggregate({ where: { partId: part.id }, _sum: { qtyDelta: true } });
    const cur = await prisma.sparePart.findUniqueOrThrow({ where: { id: part.id } });
    expect(sum._sum.qtyDelta!.toString()).toBe(cur.onHand.toString());
  });

  it("إرجاع قطعة غير مستخدمة يعيدها للمخزن بنفس تكلفتها", async () => {
    const part = await createPart(w.admin, { code: "P-300", name: "كابل", salePrice: 20 });
    await receiveStock(w.stock, { partId: part.id, qty: 5, unitCost: 8 });
    const o = await newOrder();
    await prisma.serviceOrder.update({ where: { id: o.id }, data: { status: "AWAITING_QUOTE" } });
    const q = await createQuotation(w.tech, o.id, { lines: [{ type: "PART", description: "كابل", partId: part.id, qty: 2 }] });
    await sendQuotation(w.tech, q.id);
    await approveQuotation(w.reception, q.id, { channel: "PHONE", contactAt: new Date() });
    await issuePart(w.tech, { orderId: o.id, partId: part.id, qty: 2 });
    await returnPart(w.tech, { orderId: o.id, partId: part.id, qty: 1 });
    await expect(returnPart(w.tech, { orderId: o.id, partId: part.id, qty: 2 })).rejects.toThrow();
    const p = await prisma.sparePart.findUniqueOrThrow({ where: { id: part.id } });
    expect(p.onHand.toString()).toBe("4");
    const op = await prisma.orderPart.findFirstOrThrow({ where: { orderId: o.id } });
    expect(op.costTotal.toString()).toBe("8");
    // إلغاء مع قطعة مصروفة غير مرجعة مرفوض
    await expect(transition(w.manager, o.id, "CANCELLED", "سبب")).rejects.toThrow(/قطع غيار/);
  });
});

describe("TEST 11: الصلاحيات من الخادم", () => {
  it("الفني لا يسجل دفعة ولا يستلم مخزنًا ولا يرد مبلغًا", async () => {
    const o = await newOrder();
    await expect(createPayment(w.tech, { orderId: o.id, amount: 10 })).rejects.toMatchObject({ status: 403 });
    await expect(refund(w.cashier, { orderId: o.id, amount: 1, reason: "xxx" })).rejects.toMatchObject({ status: 403 });
    const part = await createPart(w.admin, { code: "P-400", name: "x" });
    await expect(receiveStock(w.tech, { partId: part.id, qty: 1, unitCost: 1 })).rejects.toMatchObject({ status: 403 });
    await expect(createPayment(w.stock, { orderId: o.id, amount: 10 })).rejects.toMatchObject({ status: 403 });
  });
  it("الفني لا يرى أوامر غير مسندة إليه", async () => {
    const other = await newOrder({ technicianId: undefined });
    await expect(getOrder(w.tech, other.id)).rejects.toMatchObject({ status: 403 });
  });
  it("الرد المالي لا يتجاوز الصافي ويحتاج سببًا", async () => {
    const o = await newOrder({ deposit: { amount: 100 } });
    await expect(refund(w.manager, { orderId: o.id, amount: 150, reason: "خطأ" })).rejects.toThrow();
    await refund(w.manager, { orderId: o.id, amount: 100, reason: "إلغاء الطلب" });
    expect((await financeOf(prisma, o.id)).net.toString()).toBe("0");
    await transition(w.manager, o.id, "CANCELLED", "ألغاه العميل");
  });
});

describe("TEST 10: الضمان", () => {
  it("يفتح أمر ضمان مرتبط بالأصلي ويسجل القرار ويرفض خارج المدة", async () => {
    const part = await createPart(w.admin, { code: "P-500", name: "ريموت" });
    const orig = await newOrder();
    await prisma.serviceOrder.update({ where: { id: orig.id }, data: { status: "AWAITING_QUOTE" } });
    const q = await createQuotation(w.tech, orig.id, { lines: [{ type: "LABOR", description: "مصنعية", qty: 1, unitPrice: 100 }] });
    await sendQuotation(w.tech, q.id);
    await approveQuotation(w.reception, q.id, { channel: "PHONE", contactAt: new Date() });
    await prisma.serviceOrder.update({ where: { id: orig.id }, data: { status: "READY_FOR_DELIVERY" } });
    await deliver(w.reception, orig.id, { receiverName: "العميل", collect: { amount: 100 }, warrantyMonths: 3 });
    const o = await prisma.serviceOrder.findUniqueOrThrow({ where: { id: orig.id } });
    const ret = await createOrder(w.reception, { customerId, deviceId: o.deviceId, complaint: "عاد العطل", warrantyOfId: orig.id, warrantyDecision: "ACCEPTED", warrantyReason: "نفس العطل", technicianId: w.tech.userId });
    expect(ret.warrantyOfId).toBe(orig.id);
    expect(ret.warrantyCovered).toBe(true);
    // خارج المدة
    await prisma.warranty.update({ where: { orderId: orig.id }, data: { endsAt: new Date(Date.now() - 1000) } });
    await expect(createOrder(w.reception, { customerId, deviceId: o.deviceId, complaint: "عاد", warrantyOfId: orig.id, warrantyDecision: "ACCEPTED", warrantyReason: "x" })).rejects.toThrow(/انتهت/);
    void part;
  });
});
