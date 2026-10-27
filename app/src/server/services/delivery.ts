import { z } from "zod";
import { prisma, D } from "../db";
import { AppError } from "../errors";
import { type Ctx, need, can } from "../context";
import { audit } from "../audit";
import { applyTransition, approvedQuote, financeOf, lockOrder } from "./orders";
import { createPaymentTx } from "./payments";
import { nextNumber } from "../numbering";
import { getSettings } from "../settings";

const schema = z.object({
  receiverName: z.string().trim().min(2, "اسم المستلم مطلوب"),
  note: z.string().trim().optional(),
  collect: z.object({ amount: z.coerce.number().positive(), method: z.enum(["CASH", "BANK_TRANSFER", "WALLET", "CARD", "OTHER"]).default("CASH") }).optional(),
  overrideReason: z.string().trim().optional(),
  warrantyMonths: z.coerce.number().int().min(0).max(36).optional(),
  warrantyExclusions: z.string().trim().optional(),
  idempotencyKey: z.string().optional(),
});

/**
 * التسليم: مرة واحدة فقط (قفل الصف + انتقال الحالة)، يتطلب سداد المتبقي أو استثناء معتمد بصلاحية ومبرر،
 * ويصدر الضمان تلقائيًا للأوامر التي نُفذ فيها إصلاح معتمد.
 */
export async function deliver(ctx: Ctx, orderId: string, raw: unknown) {
  need(ctx, "delivery.perform");
  const input = schema.parse(raw);
  return prisma.$transaction(async (tx) => {
    const order = await lockOrder(tx, orderId);
    if (order.status === "DELIVERED") throw new AppError("تم تسليم هذا الأمر من قبل", 409, "ALREADY_DELIVERED");
    if (order.status !== "READY_FOR_DELIVERY") throw new AppError("الأمر ليس جاهزًا للتسليم", 409);

    if (input.collect) {
      await createPaymentTx(tx, ctx, { orderId, kind: "PAYMENT", method: input.collect.method, amount: input.collect.amount, idempotencyKey: input.idempotencyKey ? `${input.idempotencyKey}:pay` : undefined });
    }
    const f = await financeOf(tx, orderId, order.status);
    let override: string | null = null;
    if (f.balance.gt(0)) {
      if (!input.overrideReason?.trim()) throw new AppError(`المتبقي ${f.balance.toFixed(2)} ج.م؛ حصّله أو اطلب استثناء تسليم معتمدًا`, 409, "BALANCE_DUE");
      if (!can(ctx, "delivery.override")) throw new AppError("التسليم مع وجود متبقٍ يتطلب صلاحية اعتماد الاستثناء", 403);
      override = `${input.overrideReason} (متبقٍ ${f.balance.toFixed(2)})`;
    }
    if (f.balance.lt(0)) throw new AppError(`يوجد رصيد دائن للعميل ${f.balance.abs().toFixed(2)}؛ سجّل مرتجعًا ماليًا قبل التسليم`, 409, "CREDIT_BALANCE");

    await applyTransition(tx, ctx.userId, orderId, "DELIVERED", {
      system: true,
      note: `تسليم إلى ${input.receiverName}`,
      patch: { deliveredAt: new Date(), deliveredTo: input.receiverName, deliveryNote: input.note, deliveryOverride: override },
    });

    const q = await approvedQuote(tx, orderId);
    let warranty = null;
    const settings = await getSettings(tx);
    const months = input.warrantyMonths ?? settings.defaultWarrantyMonths;
    if (q && months > 0) {
      const startsAt = new Date();
      const endsAt = new Date(startsAt);
      endsAt.setMonth(endsAt.getMonth() + months);
      const coverage = q.lines.filter((l) => l.type === "PART" || l.type === "LABOR").map((l) => l.description).join("، ") || "الإصلاح المنفذ";
      warranty = await tx.warranty.create({
        data: {
          number: await nextNumber(tx, "WR"),
          orderId, customerId: order.customerId, deviceId: order.deviceId,
          startsAt, endsAt, months, coverage,
          exclusions: input.warrantyExclusions || "سوء الاستخدام، الكسر، السوائل، الأعطال الجديدة غير المرتبطة بالإصلاح",
        },
      });
    }
    await audit(tx, ctx.userId, "order.deliver", "ServiceOrder", orderId, { receiver: input.receiverName, override });
    return { orderId, warranty, balance: D(f.balance).toString() };
  });
}
