import { z } from "zod";
import { prisma, D, type Tx } from "../db";
import { AppError, notFound } from "../errors";
import { type Ctx, need, can } from "../context";
import { audit } from "../audit";
import { round2, ZERO } from "../money";
import { applyTransition, lockOrder, approvedQuote } from "./orders";
import { getSettings } from "../settings";

const lineSchema = z.object({
  type: z.enum(["INSPECTION", "LABOR", "PART", "SERVICE"]),
  description: z.string().trim().min(1, "وصف البند مطلوب"),
  partId: z.string().optional(),
  qty: z.coerce.number().positive("الكمية يجب أن تكون أكبر من صفر"),
  unitPrice: z.coerce.number().min(0).optional(),
});
const quoteSchema = z.object({
  lines: z.array(lineSchema).min(1, "أضف بندًا واحدًا على الأقل"),
  discount: z.coerce.number().min(0).default(0),
  taxRate: z.coerce.number().min(0).max(100).optional(),
  validDays: z.coerce.number().int().positive().optional(),
  terms: z.string().trim().optional(),
  notes: z.string().trim().optional(),
});

const EDITABLE_ORDER_STATES = ["INSPECTING", "AWAITING_QUOTE", "AWAITING_APPROVAL", "REPAIRING", "REWORK", "READY_TO_REPAIR", "AWAITING_PARTS"];

export async function createQuotation(ctx: Ctx, orderId: string, raw: unknown) {
  need(ctx, "quote.write");
  const input = quoteSchema.parse(raw);
  const settings = await getSettings();
  return prisma.$transaction(async (tx) => {
    const order = await lockOrder(tx, orderId);
    if (!EDITABLE_ORDER_STATES.includes(order.status)) throw new AppError("لا يمكن إنشاء عرض سعر في الحالة الحالية للأمر", 409);
    if (!can(ctx, "order.read_all") && order.technicianId !== ctx.userId) throw new AppError("هذا الأمر غير مسند إليك", 403);

    const covered = order.warrantyCovered === true;
    const parts = await tx.sparePart.findMany({ where: { id: { in: input.lines.map((l) => l.partId).filter(Boolean) as string[] } } });
    const partMap = new Map(parts.map((p) => [p.id, p]));

    const lines = input.lines.map((l) => {
      const part = l.partId ? partMap.get(l.partId) : undefined;
      if (l.type === "PART" && !part) throw new AppError("بند قطعة غيار يتطلب اختيار قطعة من المخزون");
      let price = D(l.unitPrice ?? part?.salePrice ?? 0);
      // تغيير سعر بيع القطعة عن السعر المعتمد يتطلب صلاحية
      if (part && l.unitPrice !== undefined && !price.eq(part.salePrice) && !can(ctx, "part.price"))
        throw new AppError(`لا تملك صلاحية تعديل سعر القطعة ${part.code}`, 403);
      if (covered && l.type !== "SERVICE") price = ZERO;
      return { type: l.type, description: l.description, partId: part?.id, qty: D(l.qty), unitPrice: round2(price), estUnitCost: part?.avgCost };
    });
    const subtotal = round2(lines.reduce((s, l) => s.plus(l.qty.mul(l.unitPrice)), ZERO));
    const discount = round2(D(input.discount));
    if (discount.gt(subtotal)) throw new AppError("الخصم أكبر من إجمالي البنود");
    const taxRate = D(input.taxRate ?? settings.taxRate);
    const taxAmount = round2(subtotal.minus(discount).mul(taxRate).div(100));
    const total = subtotal.minus(discount).plus(taxAmount);

    const last = await tx.quotation.findFirst({ where: { orderId }, orderBy: { version: "desc" } });
    // نسخة جديدة تستبدل أي مسودة/مرسلة سابقة؛ المعتمدة تبقى سارية حتى اعتماد البديل
    await tx.quotation.updateMany({ where: { orderId, status: { in: ["DRAFT", "SENT"] } }, data: { status: "SUPERSEDED" } });
    const q = await tx.quotation.create({
      data: {
        orderId,
        version: (last?.version ?? 0) + 1,
        subtotal,
        discount,
        taxRate,
        taxAmount,
        total,
        validUntil: new Date(Date.now() + (input.validDays ?? settings.quoteValidityDays) * 86400000),
        terms: input.terms,
        notes: input.notes,
        createdById: ctx.userId,
        lines: { create: lines },
      },
      include: { lines: true },
    });
    await audit(tx, ctx.userId, "quote.create", "Quotation", q.id, { version: q.version, total: total.toString() });
    return q;
  });
}

async function loadQuote(tx: Tx, id: string) {
  const q = await tx.quotation.findUnique({ where: { id }, include: { lines: true } });
  if (!q) throw notFound("عرض السعر غير موجود");
  return q;
}

/** إرسال العرض للعميل: ينقل الأمر إلى «في انتظار موافقة العميل». */
export async function sendQuotation(ctx: Ctx, id: string) {
  need(ctx, "quote.write");
  return prisma.$transaction(async (tx) => {
    const q = await loadQuote(tx, id);
    const order = await lockOrder(tx, q.orderId);
    if (q.status !== "DRAFT") throw new AppError("يمكن إرسال المسودة فقط", 409);
    if (order.status !== "AWAITING_QUOTE") throw new AppError("يجب أن يكون الأمر في «انتظار إعداد عرض السعر»", 409);
    await tx.quotation.update({ where: { id }, data: { status: "SENT" } });
    await applyTransition(tx, ctx.userId, order.id, "AWAITING_APPROVAL", { system: true, note: `إرسال عرض السعر رقم ${q.version}` });
    await audit(tx, ctx.userId, "quote.send", "Quotation", id);
    return tx.quotation.findUnique({ where: { id } });
  });
}

const approvalSchema = z.object({
  channel: z.enum(["PHONE", "WHATSAPP", "IN_PERSON", "OTHER"]),
  contactAt: z.coerce.date(),
  note: z.string().trim().optional(),
});

export async function approveQuotation(ctx: Ctx, id: string, raw: unknown) {
  need(ctx, "quote.approve");
  const input = approvalSchema.parse(raw);
  return prisma.$transaction(async (tx) => {
    const q = await loadQuote(tx, id);
    const order = await lockOrder(tx, q.orderId);
    if (q.status !== "SENT") throw new AppError("لا يمكن اعتماد عرض غير مُرسل للعميل", 409);
    if (order.status !== "AWAITING_APPROVAL") throw new AppError("الأمر ليس في انتظار موافقة العميل", 409);
    if (q.validUntil && q.validUntil < new Date()) {
      await tx.quotation.update({ where: { id }, data: { status: "EXPIRED" } });
      throw new AppError("انتهت صلاحية عرض السعر؛ أنشئ عرضًا جديدًا", 409);
    }
    const prev = await approvedQuote(tx, order.id);
    if (prev) await tx.quotation.update({ where: { id: prev.id }, data: { status: "SUPERSEDED" } });
    await tx.quotation.update({
      where: { id },
      data: {
        status: "APPROVED",
        approvedAt: new Date(),
        approvalBy: ctx.userId,
        approvalChannel: input.channel,
        approvalContactAt: input.contactAt,
        approvalNote: input.note,
      },
    });
    const delta = prev ? q.total.minus(prev.total) : q.total;
    await applyTransition(tx, ctx.userId, order.id, "READY_TO_REPAIR", {
      system: true,
      note: prev ? `موافقة العميل على تعديل العرض (فرق ${delta.toFixed(2)})` : "موافقة العميل على عرض السعر",
    });
    await audit(tx, ctx.userId, "quote.approve", "Quotation", id, { version: q.version, total: q.total.toString(), delta: delta.toString(), channel: input.channel });
    return tx.quotation.findUnique({ where: { id } });
  });
}

export async function rejectQuotation(ctx: Ctx, id: string, reason?: string) {
  need(ctx, "quote.approve");
  return prisma.$transaction(async (tx) => {
    const q = await loadQuote(tx, id);
    const order = await lockOrder(tx, q.orderId);
    if (q.status !== "SENT") throw new AppError("لا يمكن رفض عرض غير مُرسل", 409);
    await tx.quotation.update({ where: { id }, data: { status: "REJECTED", rejectionReason: reason || null } });
    // لو كان هناك عرض معتمد سابق (تعديل أثناء الإصلاح) يرجع الأمر لحالة الإصلاح بدل الرفض الكلي
    const prev = await approvedQuote(tx, order.id);
    if (prev) {
      await applyTransition(tx, ctx.userId, order.id, "READY_TO_REPAIR", { system: true, note: "رفض العميل البند الإضافي؛ يستمر العمل على العرض المعتمد سابقًا" });
    } else {
      await applyTransition(tx, ctx.userId, order.id, "REJECTED", { system: true, note: reason || "رفض العميل عرض السعر", patch: { rejectionReason: reason || null } });
    }
    await audit(tx, ctx.userId, "quote.reject", "Quotation", id, { reason: reason ?? null });
    return tx.quotation.findUnique({ where: { id } });
  });
}
