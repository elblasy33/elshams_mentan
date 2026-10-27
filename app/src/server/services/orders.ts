import { z } from "zod";
import { prisma, D, type Tx } from "../db";
import { AppError, conflict, forbidden, notFound } from "../errors";
import { type Ctx, need, can } from "../context";
import { audit } from "../audit";
import { nextNumber } from "../numbering";
import { EDGES, STATUS_LABEL, TERMINAL } from "../workflow";
import type { OrderStatus, Prisma } from "../../generated/prisma/client";
import { balanceOf, round2, ZERO } from "../money";
import { createPaymentTx } from "./payments";
import { getSettings } from "../settings";

export const orderInput = z.object({
  customerId: z.string().min(1, "العميل مطلوب"),
  deviceId: z.string().optional(),
  newDevice: z
    .object({
      typeId: z.string().min(1, "نوع الجهاز مطلوب"),
      brand: z.string().trim().optional(),
      model: z.string().trim().optional(),
      serial: z.string().trim().optional(),
      size: z.string().trim().optional(),
      color: z.string().trim().optional(),
    })
    .optional(),
  intakeChannel: z.enum(["BRANCH", "PICKUP", "COMMERCIAL", "OTHER"]).default("BRANCH"),
  executionMode: z.enum(["INTERNAL", "FIELD", "EXTERNAL"]).default("INTERNAL"),
  priority: z.enum(["NORMAL", "HIGH", "URGENT"]).default("NORMAL"),
  complaint: z.string().trim().min(3, "وصف الشكوى مطلوب"),
  intakeCondition: z.string().trim().optional(),
  accessories: z.string().trim().optional(),
  expectedAt: z.coerce.date().optional(),
  technicianId: z.string().optional(),
  customerNotes: z.string().trim().optional(),
  internalNotes: z.string().trim().optional(),
  warrantyOfId: z.string().optional(),
  warrantyDecision: z.enum(["ACCEPTED", "REJECTED"]).optional(),
  warrantyReason: z.string().trim().optional(),
  warrantyCovered: z.boolean().optional(),
  deposit: z
    .object({
      amount: z.coerce.number().positive("قيمة العربون يجب أن تكون أكبر من صفر"),
      method: z.enum(["CASH", "BANK_TRANSFER", "WALLET", "CARD", "OTHER"]).default("CASH"),
    })
    .optional(),
  idempotencyKey: z.string().optional(),
});
export type OrderInput = z.infer<typeof orderInput>;

/** عرض السعر المعتمد الحالي (آخر نسخة معتمدة). */
export async function approvedQuote(tx: Tx | typeof prisma, orderId: string) {
  return tx.quotation.findFirst({
    where: { orderId, status: "APPROVED" },
    orderBy: { version: "desc" },
    include: { lines: true },
  });
}

/** المستحق على العميل: إجمالي العرض المعتمد، أو رسوم الفحص للأمر المرفوض. */
export async function amountDue(tx: Tx | typeof prisma, orderId: string, status?: OrderStatus) {
  const q = await approvedQuote(tx, orderId);
  if (q) return q.total;
  const st = status ?? (await tx.serviceOrder.findUnique({ where: { id: orderId }, select: { status: true } }))?.status;
  if (st === "REJECTED" || st === "READY_FOR_DELIVERY") {
    const rej = await tx.quotation.findFirst({
      where: { orderId, status: "REJECTED" },
      orderBy: { version: "desc" },
      include: { lines: true },
    });
    if (rej) {
      return round2(
        rej.lines.filter((l) => l.type === "INSPECTION").reduce((s, l) => s.plus(l.qty.mul(l.unitPrice)), ZERO),
      );
    }
  }
  return ZERO;
}

export async function financeOf(tx: Tx | typeof prisma, orderId: string, status?: OrderStatus) {
  const [due, pays] = await Promise.all([
    amountDue(tx, orderId, status),
    tx.payment.findMany({ where: { orderId }, select: { kind: true, amount: true } }),
  ]);
  return { due, ...balanceOf(due, pays) };
}

function assertAccess(ctx: Ctx, order: { technicianId: string | null }) {
  if (can(ctx, "order.read_all")) return;
  if (!can(ctx, "order.read") || order.technicianId !== ctx.userId) throw forbidden("هذا الأمر غير مسند إليك");
}

export async function lockOrder(tx: Tx, id: string) {
  await tx.$queryRaw`SELECT id FROM "ServiceOrder" WHERE id = ${id} FOR UPDATE`;
  const o = await tx.serviceOrder.findUnique({ where: { id } });
  if (!o) throw notFound("أمر الصيانة غير موجود");
  return o;
}

export async function createOrder(ctx: Ctx, raw: unknown) {
  need(ctx, "order.create");
  const input = orderInput.parse(raw);
  if (!input.deviceId && !input.newDevice) throw new AppError("اختر جهازًا مسجلًا أو أدخل بيانات جهاز جديد");
  if (input.technicianId) need(ctx, "order.assign");

  return prisma.$transaction(async (tx) => {
    const customer = await tx.customer.findUnique({ where: { id: input.customerId } });
    if (!customer || customer.archivedAt) throw new AppError("العميل غير موجود أو مؤرشف");

    let deviceId = input.deviceId;
    if (deviceId) {
      const dev = await tx.customerDevice.findUnique({ where: { id: deviceId } });
      if (!dev || dev.customerId !== customer.id) throw new AppError("الجهاز لا يخص هذا العميل");
    } else {
      const nd = input.newDevice!;
      const created = await tx.customerDevice.create({
        data: {
          customerId: customer.id,
          typeId: nd.typeId,
          brand: nd.brand || null,
          model: nd.model || null,
          serial: nd.serial || null,
          size: nd.size || null,
          color: nd.color || null,
        },
      });
      deviceId = created.id;
    }

    // ربط أمر الضمان بالأمر الأصلي والتحقق من المدة
    let warranty: Prisma.ServiceOrderUncheckedCreateInput | Record<string, unknown> = {};
    if (input.warrantyOfId) {
      need(ctx, "warranty.decide");
      const w = await tx.warranty.findFirst({ where: { orderId: input.warrantyOfId } });
      if (!w || w.deviceId !== deviceId) throw new AppError("لا يوجد ضمان لهذا الجهاز على الأمر المحدد");
      if (!input.warrantyDecision) throw new AppError("قرار الضمان (قبول/رفض) مطلوب");
      if (!input.warrantyReason) throw new AppError("سبب قرار الضمان مطلوب");
      const inPeriod = new Date() <= w.endsAt;
      if (input.warrantyDecision === "ACCEPTED" && !inPeriod)
        throw new AppError("انتهت مدة الضمان؛ لا يمكن قبول الحالة كضمان");
      warranty = {
        warrantyOfId: input.warrantyOfId,
        warrantyDecision: input.warrantyDecision,
        warrantyReason: input.warrantyReason,
        warrantyCovered: input.warrantyDecision === "ACCEPTED" ? (input.warrantyCovered ?? true) : false,
      };
    }

    const number = await nextNumber(tx, "SHS");
    const order = await tx.serviceOrder.create({
      data: {
        number,
        customerId: customer.id,
        deviceId,
        intakeChannel: input.intakeChannel,
        executionMode: input.executionMode,
        priority: input.priority,
        complaint: input.complaint,
        intakeCondition: input.intakeCondition || null,
        accessories: input.accessories || null,
        expectedAt: input.expectedAt,
        receivedById: ctx.userId,
        technicianId: input.technicianId || null,
        customerNotes: input.customerNotes || null,
        internalNotes: input.internalNotes || null,
        status: "RECEIVED",
        ...warranty,
      },
    });
    await tx.orderStatusHistory.create({
      data: { orderId: order.id, from: null, to: "RECEIVED", userId: ctx.userId, note: "تم استلام الجهاز" },
    });
    await audit(tx, ctx.userId, "order.create", "ServiceOrder", order.id, { number });

    if (input.deposit) {
      need(ctx, "payment.create");
      await createPaymentTx(tx, ctx, {
        orderId: order.id,
        kind: "DEPOSIT",
        method: input.deposit.method,
        amount: input.deposit.amount,
        idempotencyKey: input.idempotencyKey ? `${input.idempotencyKey}:deposit` : undefined,
      });
    }
    return order;
  });
}

/** يطبّق الانتقال داخل معاملة قائمة. system=true للإجراءات الداخلية الموثقة. */
export async function applyTransition(
  tx: Tx,
  userId: string,
  orderId: string,
  to: OrderStatus,
  opts: { note?: string; system?: boolean; patch?: Prisma.ServiceOrderUncheckedUpdateInput } = {},
) {
  const order = await lockOrder(tx, orderId);
  const edge = EDGES[order.status].find((e) => e.to === to);
  if (!edge) throw new AppError(`لا يمكن الانتقال من «${STATUS_LABEL[order.status]}» إلى «${STATUS_LABEL[to]}»`, 409, "INVALID_TRANSITION");
  if (edge.system && !opts.system) throw new AppError(`الانتقال إلى «${STATUS_LABEL[to]}» يتم عبر الإجراء المخصص له فقط`, 409, "SYSTEM_TRANSITION");

  // شروط الانتقال
  if (to === "INSPECTING" && !order.technicianId) throw new AppError("أسند الأمر إلى فني قبل بدء الفحص");
  if (to === "AWAITING_QUOTE" && order.status === "INSPECTING" && !order.diagnosis?.trim())
    throw new AppError("سجّل التشخيص الفني قبل طلب إعداد عرض السعر");
  if (to === "REPAIRING" || to === "AWAITING_PARTS" || to === "READY_TO_REPAIR") {
    if (!(await approvedQuote(tx, orderId)))
      throw new AppError("لا يمكن بدء الإصلاح دون عرض سعر معتمد من العميل");
  }
  if (to === "AWAITING_TEST" && !order.repairNotes?.trim()) throw new AppError("سجّل الأعمال المنفذة قبل إرسال الجهاز للاختبار");
  if (to === "READY_FOR_DELIVERY" && order.status === "REPAIRED") {
    const last = await tx.qualityTest.findFirst({ where: { orderId }, orderBy: { round: "desc" } });
    if (last?.result !== "PASS") throw new AppError("لا يمكن اعتبار الجهاز جاهزًا للتسليم قبل اجتياز الاختبار");
  }
  if (to === "CANCELLED") {
    const f = await financeOf(tx, orderId, order.status);
    if (f.net.gt(0)) throw new AppError("يوجد مبالغ محصلة على الأمر؛ سجّل مرتجعًا ماليًا أولًا ثم ألغِ الأمر", 409);
    const parts = await tx.orderPart.findMany({ where: { orderId } });
    if (parts.some((p) => p.qtyIssued.minus(p.qtyReturned).minus(p.qtyDamaged).gt(0)))
      throw new AppError("توجد قطع غيار مصروفة لم تُرجَع؛ أرجعها للمخزن أو سجلها تالفة أولًا", 409);
    if (!opts.note?.trim()) throw new AppError("سبب الإلغاء مطلوب");
  }

  const res = await tx.serviceOrder.updateMany({
    where: { id: orderId, version: order.version },
    data: { status: to, version: { increment: 1 }, ...(opts.patch as object) },
  });
  if (res.count !== 1) throw conflict("تم تعديل الأمر من مستخدم آخر، أعد المحاولة");
  await tx.orderStatusHistory.create({ data: { orderId, from: order.status, to, userId, note: opts.note || null } });
  await audit(tx, userId, "order.transition", "ServiceOrder", orderId, { from: order.status, to, note: opts.note ?? null });
  return order;
}

export async function transition(ctx: Ctx, orderId: string, to: OrderStatus, note?: string) {
  need(ctx, "order.transition");
  if (to === "CANCELLED") need(ctx, "order.cancel");
  return prisma.$transaction(async (tx) => {
    const o = await lockOrder(tx, orderId);
    assertAccess(ctx, o);
    await applyTransition(tx, ctx.userId, orderId, to, { note });
    return tx.serviceOrder.findUnique({ where: { id: orderId } });
  });
}

const updateSchema = z.object({
  diagnosis: z.string().trim().optional(),
  repairNotes: z.string().trim().optional(),
  internalNotes: z.string().trim().optional(),
  technicianId: z.string().nullable().optional(),
  expectedAt: z.coerce.date().nullable().optional(),
  delayReason: z.string().trim().optional(),
  priority: z.enum(["NORMAL", "HIGH", "URGENT"]).optional(),
});

export async function updateOrder(ctx: Ctx, orderId: string, raw: unknown) {
  const input = updateSchema.parse(raw);
  return prisma.$transaction(async (tx) => {
    const o = await lockOrder(tx, orderId);
    assertAccess(ctx, o);
    if (TERMINAL.includes(o.status)) throw new AppError("لا يمكن تعديل أمر مكتمل أو ملغي", 409);
    const data: Prisma.ServiceOrderUncheckedUpdateInput = {};
    if (input.diagnosis !== undefined || input.repairNotes !== undefined) {
      need(ctx, "order.diagnose");
      if (input.diagnosis !== undefined) data.diagnosis = input.diagnosis;
      if (input.repairNotes !== undefined) data.repairNotes = input.repairNotes;
    }
    if (input.technicianId !== undefined) {
      need(ctx, "order.assign");
      data.technicianId = input.technicianId;
    }
    if (input.expectedAt !== undefined || input.delayReason !== undefined) {
      need(ctx, "order.transition");
      if (input.expectedAt !== undefined) {
        if (o.expectedAt && !input.delayReason?.trim()) throw new AppError("سبب تغيير الموعد المتوقع مطلوب");
        data.expectedAt = input.expectedAt;
      }
      if (input.delayReason !== undefined) data.delayReason = input.delayReason;
    }
    if (input.internalNotes !== undefined) {
      need(ctx, "order.transition");
      data.internalNotes = input.internalNotes;
    }
    if (input.priority) {
      need(ctx, "order.transition");
      data.priority = input.priority;
    }
    const updated = await tx.serviceOrder.update({ where: { id: orderId }, data: { ...data, version: { increment: 1 } } });
    await audit(tx, ctx.userId, "order.update", "ServiceOrder", orderId, JSON.parse(JSON.stringify(input)));
    return updated;
  });
}

export const ORDER_PAGE = 20;

export async function listOrders(
  ctx: Ctx,
  q: { search?: string; status?: string; technicianId?: string; overdue?: boolean; page?: number; customerId?: string; from?: string; to?: string },
) {
  need(ctx, "order.read");
  const where: Prisma.ServiceOrderWhereInput = {};
  if (!can(ctx, "order.read_all")) where.technicianId = ctx.userId;
  if (q.status) where.status = q.status as OrderStatus;
  if (q.technicianId) where.technicianId = q.technicianId;
  if (q.customerId) where.customerId = q.customerId;
  if (q.overdue) {
    where.expectedAt = { lt: new Date() };
    where.status = { notIn: ["DELIVERED", "CANCELLED", "READY_FOR_DELIVERY", "REJECTED"] };
  }
  if (q.from || q.to) where.receivedAt = { ...(q.from && { gte: new Date(q.from) }), ...(q.to && { lte: new Date(q.to + "T23:59:59") }) };
  if (q.search?.trim()) {
    const s = q.search.trim();
    where.OR = [
      { number: { contains: s, mode: "insensitive" } },
      { customer: { name: { contains: s, mode: "insensitive" } } },
      { customer: { phone: { contains: s } } },
      { device: { serial: { contains: s, mode: "insensitive" } } },
    ];
  }
  const page = Math.max(1, q.page ?? 1);
  const [total, items] = await Promise.all([
    prisma.serviceOrder.count({ where }),
    prisma.serviceOrder.findMany({
      where,
      orderBy: { receivedAt: "desc" },
      skip: (page - 1) * ORDER_PAGE,
      take: ORDER_PAGE,
      include: { customer: { select: { name: true, phone: true } }, device: { include: { type: true } }, technician: { select: { name: true } } },
    }),
  ]);
  return { items, total, page, pages: Math.ceil(total / ORDER_PAGE) };
}

export async function getOrder(ctx: Ctx, id: string) {
  need(ctx, "order.read");
  const o = await prisma.serviceOrder.findUnique({
    where: { id },
    include: {
      customer: true,
      device: { include: { type: true } },
      receivedBy: { select: { name: true } },
      technician: { select: { id: true, name: true } },
      history: { orderBy: { createdAt: "asc" } },
      quotations: { orderBy: { version: "desc" }, include: { lines: { include: { part: { select: { code: true, name: true } } } } } },
      payments: { orderBy: { createdAt: "asc" } },
      parts: { include: { part: { select: { code: true, name: true, unit: true } } } },
      tests: { orderBy: { round: "asc" } },
      warranty: true,
      warrantyOf: { select: { id: true, number: true } },
      returns: { select: { id: true, number: true, status: true } },
    },
  });
  if (!o) throw notFound("أمر الصيانة غير موجود");
  assertAccess(ctx, o);
  const finance = await financeOf(prisma, id, o.status);
  const users = await prisma.user.findMany({ where: { id: { in: [...new Set(o.history.map((h) => h.userId))] } }, select: { id: true, name: true } });
  const userName = Object.fromEntries(users.map((u) => [u.id, u.name]));
  return { ...o, finance, userName };
}

export async function getSettingsFor(ctx: Ctx) {
  return getSettings();
}
export { D };
