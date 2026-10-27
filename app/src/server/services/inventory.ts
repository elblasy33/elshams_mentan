import { z } from "zod";
import { prisma, D, Prisma, type Tx } from "../db";
import { AppError, notFound } from "../errors";
import { type Ctx, need, can } from "../context";
import { audit } from "../audit";
import { round2, ZERO } from "../money";
import { lockOrder, approvedQuote } from "./orders";
import { getSettings } from "../settings";

const partSchema = z.object({
  code: z.string().trim().min(1, "كود القطعة مطلوب"),
  name: z.string().trim().min(1, "اسم القطعة مطلوب"),
  category: z.string().trim().optional(),
  unit: z.string().trim().default("قطعة"),
  salePrice: z.coerce.number().min(0).default(0),
  reorderLevel: z.coerce.number().min(0).default(0),
  location: z.string().trim().optional(),
  compatible: z.string().trim().optional(),
});

export async function createPart(ctx: Ctx, raw: unknown) {
  need(ctx, "stock.manage");
  const input = partSchema.parse(raw);
  if (input.salePrice > 0) need(ctx, "part.price");
  const dup = await prisma.sparePart.findUnique({ where: { code: input.code } });
  if (dup) throw new AppError("كود القطعة مستخدم بالفعل", 409);
  const part = await prisma.sparePart.create({ data: { ...input, category: input.category || null, location: input.location || null, compatible: input.compatible || null } });
  await audit(prisma, ctx.userId, "part.create", "SparePart", part.id, { code: part.code });
  return part;
}

export async function updatePart(ctx: Ctx, id: string, raw: unknown) {
  need(ctx, "stock.manage");
  const input = partSchema.partial().parse(raw);
  if (input.salePrice !== undefined) need(ctx, "part.price");
  delete (input as { code?: string }).code; // الكود ثابت بعد الإنشاء
  const part = await prisma.sparePart.update({ where: { id }, data: input });
  await audit(prisma, ctx.userId, "part.update", "SparePart", id, JSON.parse(JSON.stringify(input)));
  return part;
}

async function lockPart(tx: Tx, id: string) {
  await tx.$queryRaw`SELECT id FROM "SparePart" WHERE id = ${id} FOR UPDATE`;
  const p = await tx.sparePart.findUnique({ where: { id } });
  if (!p) throw notFound("القطعة غير موجودة");
  return p;
}

async function dupMovement(tx: Tx, key?: string) {
  if (!key) return null;
  return tx.stockMovement.findUnique({ where: { idempotencyKey: key } });
}

/** كل تغيير في الرصيد يمر من هنا: يقفل القطعة، يتحقق، يسجل الحركة ويحدّث الرصيد في نفس المعاملة. */
async function applyMovement(
  tx: Tx,
  ctx: Ctx,
  part: Awaited<ReturnType<typeof lockPart>>,
  m: { type: Prisma.StockMovementUncheckedCreateInput["type"]; qtyDelta: Prisma.Decimal; unitCost: Prisma.Decimal; orderId?: string; reference?: string; reason?: string; idempotencyKey?: string },
  newAvgCost?: Prisma.Decimal,
) {
  const after = part.onHand.plus(m.qtyDelta);
  if (after.lt(0)) {
    const { allowNegativeStock } = await getSettings(tx);
    if (!allowNegativeStock) throw new AppError(`الرصيد غير كافٍ للقطعة ${part.code} (المتاح ${part.onHand})`, 409, "INSUFFICIENT_STOCK");
    await audit(tx, ctx.userId, "stock.negative", "SparePart", part.id, { after: after.toString() });
  }
  const mv = await tx.stockMovement.create({
    data: { ...m, partId: part.id, balanceAfter: after, userId: ctx.userId },
  });
  await tx.sparePart.update({ where: { id: part.id }, data: { onHand: after, ...(newAvgCost && { avgCost: newAvgCost }) } });
  return mv;
}

const receiveSchema = z.object({
  partId: z.string(),
  qty: z.coerce.number().positive("الكمية يجب أن تكون أكبر من صفر"),
  unitCost: z.coerce.number().min(0, "التكلفة غير صحيحة"),
  reference: z.string().trim().optional(),
  idempotencyKey: z.string().optional(),
});

/** استلام مخزني: متوسط التكلفة المرجّح المتحرك. */
export async function receiveStock(ctx: Ctx, raw: unknown) {
  need(ctx, "stock.manage");
  const input = receiveSchema.parse(raw);
  return prisma.$transaction(async (tx) => {
    const dup = await dupMovement(tx, input.idempotencyKey);
    if (dup) return dup;
    const part = await lockPart(tx, input.partId);
    const qty = D(input.qty);
    const cost = D(input.unitCost);
    const base = part.onHand.gt(0) ? part.onHand : ZERO;
    const avg = base.plus(qty).isZero() ? cost : base.mul(part.avgCost).plus(qty.mul(cost)).div(base.plus(qty)).toDecimalPlaces(4);
    return applyMovement(tx, ctx, part, { type: "RECEIPT", qtyDelta: qty, unitCost: cost, reference: input.reference, idempotencyKey: input.idempotencyKey }, avg);
  });
}

const issueSchema = z.object({
  orderId: z.string(),
  partId: z.string(),
  qty: z.coerce.number().positive("الكمية يجب أن تكون أكبر من صفر"),
  idempotencyKey: z.string().optional(),
});

/**
 * صرف قطعة لأمر صيانة. شروط: حالة الأمر تسمح بالتنفيذ، والقطعة وكميتها مشمولتان بعرض سعر معتمد،
 * والرصيد كافٍ (ما لم يُفعَّل السماح بالسالب إداريًا). يُقفل الأمر ثم القطعة بترتيب ثابت لتفادي deadlock.
 */
export async function issuePart(ctx: Ctx, raw: unknown) {
  need(ctx, "stock.issue");
  const input = issueSchema.parse(raw);
  try {
    return await prisma.$transaction(async (tx) => {
      const dup = await dupMovement(tx, input.idempotencyKey);
      if (dup) return dup;
      const order = await lockOrder(tx, input.orderId);
      const again = await dupMovement(tx, input.idempotencyKey);
      if (again) return again;
      if (!can(ctx, "order.read_all") && order.technicianId !== ctx.userId) throw new AppError("هذا الأمر غير مسند إليك", 403);
      if (!["READY_TO_REPAIR", "REPAIRING", "REWORK", "AWAITING_PARTS"].includes(order.status))
        throw new AppError("لا يمكن صرف قطع في الحالة الحالية للأمر", 409);
      const q = await approvedQuote(tx, order.id);
      const qty = D(input.qty);
      const approvedQty = (q?.lines ?? []).filter((l) => l.partId === input.partId).reduce((s, l) => s.plus(l.qty), ZERO);
      const op = await tx.orderPart.findUnique({ where: { orderId_partId: { orderId: order.id, partId: input.partId } } });
      const held = (op?.qtyIssued ?? ZERO).minus(op?.qtyReturned ?? ZERO);
      if (held.plus(qty).gt(approvedQty))
        throw new AppError(`الكمية تتجاوز المعتمد في عرض السعر (المعتمد ${approvedQty}، المصروف ${held})`, 409, "NOT_APPROVED");
      const part = await lockPart(tx, input.partId);
      const mv = await applyMovement(tx, ctx, part, { type: "ISSUE", qtyDelta: qty.neg(), unitCost: part.avgCost, orderId: order.id, idempotencyKey: input.idempotencyKey });
      const cost = round4(qty.mul(part.avgCost));
      await tx.orderPart.upsert({
        where: { orderId_partId: { orderId: order.id, partId: part.id } },
        create: { orderId: order.id, partId: part.id, qtyIssued: qty, costTotal: cost },
        update: { qtyIssued: { increment: qty }, costTotal: { increment: cost } },
      });
      await audit(tx, ctx.userId, "stock.issue", "StockMovement", mv.id, { orderId: order.id, partId: part.id, qty: qty.toString() });
      return mv;
    });
  } catch (e) {
    const key = input.idempotencyKey;
    if (key && e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002") {
      const ex = await prisma.stockMovement.findUnique({ where: { idempotencyKey: key } });
      if (ex) return ex;
    }
    throw e;
  }
}
const round4 = (v: Prisma.Decimal) => v.toDecimalPlaces(4);

const returnSchema = z.object({
  orderId: z.string(),
  partId: z.string(),
  qty: z.coerce.number().positive(),
  damaged: z.boolean().default(false),
  reason: z.string().trim().optional(),
  idempotencyKey: z.string().optional(),
});

/** إرجاع قطعة غير مستخدمة للمخزن، أو تسجيلها تالفة (تبقى تكلفتها على الأمر). */
export async function returnPart(ctx: Ctx, raw: unknown) {
  need(ctx, "stock.issue");
  const input = returnSchema.parse(raw);
  return prisma.$transaction(async (tx) => {
    const dup = await dupMovement(tx, input.idempotencyKey);
    if (dup) return dup;
    const order = await lockOrder(tx, input.orderId);
    const again = await dupMovement(tx, input.idempotencyKey);
    if (again) return again;
    if (order.status === "DELIVERED") throw new AppError("لا يمكن تعديل قطع أمر مُسلَّم", 409);
    if (!can(ctx, "order.read_all") && order.technicianId !== ctx.userId) throw new AppError("هذا الأمر غير مسند إليك", 403);
    const op = await tx.orderPart.findUnique({ where: { orderId_partId: { orderId: order.id, partId: input.partId } } });
    const qty = D(input.qty);
    if (!op) throw new AppError("لم تُصرف هذه القطعة لهذا الأمر", 409);
    const usable = op.qtyIssued.minus(op.qtyReturned).minus(op.qtyDamaged);
    if (qty.gt(usable)) throw new AppError(`الكمية أكبر من القطع المصروفة المتبقية على الأمر (${usable})`, 409);
    if (input.damaged && !input.reason?.trim()) throw new AppError("سبب التلف مطلوب");
    const part = await lockPart(tx, input.partId);
    const heldQty = op.qtyIssued.minus(op.qtyReturned);
    const unit = heldQty.isZero() ? part.avgCost : op.costTotal.div(heldQty).toDecimalPlaces(4);
    if (input.damaged) {
      const mv = await applyMovement(tx, ctx, part, { type: "DAMAGE", qtyDelta: ZERO, unitCost: unit, orderId: order.id, reason: input.reason, reference: `qty=${qty}`, idempotencyKey: input.idempotencyKey });
      await tx.orderPart.update({ where: { id: op.id }, data: { qtyDamaged: { increment: qty } } });
      await audit(tx, ctx.userId, "stock.damage", "StockMovement", mv.id, { qty: qty.toString() });
      return mv;
    }
    const base = part.onHand.gt(0) ? part.onHand : ZERO;
    const avg = base.plus(qty).isZero() ? unit : base.mul(part.avgCost).plus(qty.mul(unit)).div(base.plus(qty)).toDecimalPlaces(4);
    const mv = await applyMovement(tx, ctx, part, { type: "RETURN", qtyDelta: qty, unitCost: unit, orderId: order.id, reason: input.reason, idempotencyKey: input.idempotencyKey }, avg);
    await tx.orderPart.update({ where: { id: op.id }, data: { qtyReturned: { increment: qty }, costTotal: { decrement: round4(qty.mul(unit)) } } });
    await audit(tx, ctx.userId, "stock.return", "StockMovement", mv.id, { orderId: order.id, qty: qty.toString() });
    return mv;
  });
}

const adjustSchema = z.object({ partId: z.string(), newQty: z.coerce.number().min(0), reason: z.string().trim().min(3, "سبب التسوية مطلوب") });

export async function adjustStock(ctx: Ctx, raw: unknown) {
  need(ctx, "stock.adjust");
  const input = adjustSchema.parse(raw);
  return prisma.$transaction(async (tx) => {
    const part = await lockPart(tx, input.partId);
    const delta = D(input.newQty).minus(part.onHand);
    const mv = await applyMovement(tx, ctx, part, { type: "ADJUSTMENT", qtyDelta: delta, unitCost: part.avgCost, reason: input.reason });
    await audit(tx, ctx.userId, "stock.adjust", "StockMovement", mv.id, { delta: delta.toString(), reason: input.reason });
    return mv;
  });
}

export async function listParts(ctx: Ctx, q: { search?: string; low?: boolean; page?: number }) {
  need(ctx, "stock.read");
  const page = Math.max(1, q.page ?? 1);
  const search = q.search?.trim();
  const where: Prisma.SparePartWhereInput = {
    ...(search && { OR: [{ code: { contains: search, mode: "insensitive" } }, { name: { contains: search, mode: "insensitive" } }] }),
  };
  if (q.low) {
    const ids = await prisma.$queryRaw<{ id: string }[]>`SELECT id FROM "SparePart" WHERE active AND "onHand" <= "reorderLevel"`;
    where.id = { in: ids.map((r) => r.id) };
  }
  const [total, items] = await Promise.all([
    prisma.sparePart.count({ where }),
    prisma.sparePart.findMany({ where, orderBy: { code: "asc" }, skip: (page - 1) * 25, take: 25 }),
  ]);
  return { items, total, page, pages: Math.ceil(total / 25) };
}

export async function listMovements(ctx: Ctx, q: { partId?: string; orderId?: string; page?: number }) {
  need(ctx, "stock.read");
  const page = Math.max(1, q.page ?? 1);
  const where: Prisma.StockMovementWhereInput = { ...(q.partId && { partId: q.partId }), ...(q.orderId && { orderId: q.orderId }) };
  const [total, items] = await Promise.all([
    prisma.stockMovement.count({ where }),
    prisma.stockMovement.findMany({
      where,
      orderBy: { createdAt: "desc" },
      skip: (page - 1) * 30,
      take: 30,
      include: { part: { select: { code: true, name: true } }, order: { select: { number: true } } },
    }),
  ]);
  return { items, total, page, pages: Math.ceil(total / 30) };
}
