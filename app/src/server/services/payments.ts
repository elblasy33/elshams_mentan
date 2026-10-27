import { z } from "zod";
import { prisma, D, type Tx, Prisma } from "../db";
import { AppError, notFound } from "../errors";
import { type Ctx, need } from "../context";
import { audit } from "../audit";
import { nextNumber } from "../numbering";
import { balanceOf, round2 } from "../money";
import { amountDue, lockOrder } from "./orders";

export const paymentInput = z.object({
  orderId: z.string(),
  kind: z.enum(["DEPOSIT", "PAYMENT"]).default("PAYMENT"),
  method: z.enum(["CASH", "BANK_TRANSFER", "WALLET", "CARD", "OTHER"]).default("CASH"),
  amount: z.coerce.number().positive("المبلغ يجب أن يكون أكبر من صفر"),
  idempotencyKey: z.string().optional(),
});
type PaymentIn = z.input<typeof paymentInput>;

/**
 * تسجيل دفعة. سياسة الزيادة: لا يُقبل تحصيل يتجاوز المستحق المعتمد؛ الزيادة تُرد كمرتجع مستقل.
 * قبل وجود عرض معتمد يُقبل العربون فقط (يبقى رصيدًا مقدمًا على الأمر).
 */
export async function createPaymentTx(tx: Tx, ctx: Ctx, raw: PaymentIn) {
  const input = paymentInput.parse(raw);
  if (input.idempotencyKey) {
    const existing = await tx.payment.findUnique({ where: { idempotencyKey: input.idempotencyKey } });
    if (existing) return { payment: existing, duplicate: true };
  }
  const order = await lockOrder(tx, input.orderId);
  if (order.status === "CANCELLED") throw new AppError("لا يمكن تحصيل مبالغ على أمر ملغي", 409);
  const due = await amountDue(tx, order.id, order.status);
  const pays = await tx.payment.findMany({ where: { orderId: order.id }, select: { kind: true, amount: true } });
  const { net } = balanceOf(due, pays);
  const amount = round2(D(input.amount));
  if (due.gt(0) && net.plus(amount).gt(due))
    throw new AppError(`المبلغ يتجاوز المتبقي (${due.minus(net).toFixed(2)}). سجّل الزيادة كمرتجع إن لزم`, 409, "OVERPAYMENT");
  if (due.isZero() && input.kind !== "DEPOSIT" && order.status !== "DELIVERED")
    throw new AppError("لا يوجد مستحق معتمد بعد؛ سجّل المبلغ كعربون", 409);
  const payment = await tx.payment.create({
    data: {
      number: await nextNumber(tx, "RC"),
      orderId: order.id,
      customerId: order.customerId,
      kind: input.kind,
      method: input.method,
      amount,
      userId: ctx.userId,
      idempotencyKey: input.idempotencyKey,
    },
  });
  await audit(tx, ctx.userId, "payment.create", "Payment", payment.id, { number: payment.number, amount: amount.toString(), kind: input.kind });
  return { payment, duplicate: false };
}

export async function createPayment(ctx: Ctx, raw: unknown) {
  need(ctx, "payment.create");
  try {
    return await prisma.$transaction((tx) => createPaymentTx(tx, ctx, raw as PaymentIn));
  } catch (e) {
    // سباق على نفس مفتاح الـidempotency: الطلب الثاني يعيد الدفعة الأولى
    const key = (raw as PaymentIn)?.idempotencyKey;
    if (key && e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002") {
      const existing = await prisma.payment.findUnique({ where: { idempotencyKey: key } });
      if (existing) return { payment: existing, duplicate: true };
    }
    throw e;
  }
}

const refundInput = z.object({
  orderId: z.string(),
  amount: z.coerce.number().positive(),
  method: z.enum(["CASH", "BANK_TRANSFER", "WALLET", "CARD", "OTHER"]).default("CASH"),
  reason: z.string().trim().min(3, "سبب الرد مطلوب"),
  idempotencyKey: z.string().optional(),
});

export async function refund(ctx: Ctx, raw: unknown) {
  need(ctx, "payment.refund");
  const input = refundInput.parse(raw);
  return prisma.$transaction(async (tx) => {
    if (input.idempotencyKey) {
      const ex = await tx.payment.findUnique({ where: { idempotencyKey: input.idempotencyKey } });
      if (ex) return { payment: ex, duplicate: true };
    }
    const order = await lockOrder(tx, input.orderId);
    const pays = await tx.payment.findMany({ where: { orderId: order.id }, select: { kind: true, amount: true } });
    const due = await amountDue(tx, order.id, order.status);
    const { net } = balanceOf(due, pays);
    const amount = round2(D(input.amount));
    if (amount.gt(net)) throw new AppError(`لا يمكن رد أكثر من الصافي المحصل (${net.toFixed(2)})`, 409);
    const payment = await tx.payment.create({
      data: {
        number: await nextNumber(tx, "RF"),
        orderId: order.id,
        customerId: order.customerId,
        kind: "REFUND",
        method: input.method,
        amount,
        reason: input.reason,
        userId: ctx.userId,
        idempotencyKey: input.idempotencyKey,
      },
    });
    await audit(tx, ctx.userId, "payment.refund", "Payment", payment.id, { amount: amount.toString(), reason: input.reason });
    return { payment, duplicate: false };
  });
}

export async function getPayment(ctx: Ctx, id: string) {
  need(ctx, "payment.read");
  const p = await prisma.payment.findUnique({
    where: { id },
    include: { order: { include: { device: { include: { type: true } } } }, customer: true },
  });
  if (!p) throw notFound();
  const user = await prisma.user.findUnique({ where: { id: p.userId }, select: { name: true } });
  return { ...p, userName: user?.name };
}

export async function dailyCollections(ctx: Ctx, from: Date, to: Date) {
  need(ctx, "payment.read");
  const rows = await prisma.payment.findMany({
    where: { createdAt: { gte: from, lte: to } },
    orderBy: { createdAt: "desc" },
    include: { order: { select: { number: true } }, customer: { select: { name: true } } },
  });
  const byMethod: Record<string, Prisma.Decimal> = {};
  let net = D(0);
  for (const r of rows) {
    const signed = r.kind === "REFUND" ? r.amount.neg() : r.amount;
    byMethod[r.method] = (byMethod[r.method] ?? D(0)).plus(signed);
    net = net.plus(signed);
  }
  return { rows, byMethod, net };
}
