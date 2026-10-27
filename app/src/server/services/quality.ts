import { z } from "zod";
import { prisma } from "../db";
import { AppError } from "../errors";
import { type Ctx, need, can } from "../context";
import { audit } from "../audit";
import { applyTransition, lockOrder } from "./orders";

/** قوالب الاختبار الافتراضية حسب نوع الجهاز (code في DeviceType). */
export const TEST_TEMPLATES: Record<string, string[]> = {
  TV: ["التشغيل", "الصورة", "الصوت", "المنافذ", "الريموت", "الاستقرار أثناء التشغيل"],
  RECEIVER: ["التشغيل", "استقبال الإشارة", "مخارج الصوت والصورة", "الوظائف المطلوبة", "السوفت وير"],
  REMOTE: ["الأزرار", "الإرسال", "البطارية"],
  OTHER: ["التشغيل", "الوظيفة الأساسية", "الاستقرار أثناء التشغيل"],
};

const schema = z.object({
  items: z
    .array(z.object({ name: z.string().min(1), result: z.enum(["PASS", "FAIL", "RECHECK", "NA"]), note: z.string().optional() }))
    .min(1, "أدخل بنود الاختبار"),
  notes: z.string().trim().optional(),
});

export async function recordTest(ctx: Ctx, orderId: string, raw: unknown) {
  need(ctx, "qc.write");
  const input = schema.parse(raw);
  return prisma.$transaction(async (tx) => {
    const order = await lockOrder(tx, orderId);
    if (!can(ctx, "order.read_all") && order.technicianId !== ctx.userId) throw new AppError("هذا الأمر غير مسند إليك", 403);
    if (order.status !== "AWAITING_TEST") throw new AppError("الأمر ليس في مرحلة الاختبار", 409);
    const results = input.items.map((i) => i.result);
    const failed = results.includes("FAIL");
    const result = failed ? "FAIL" : results.includes("RECHECK") ? "RECHECK" : results.every((r) => r === "NA") ? "NA" : "PASS";
    if (result === "NA") throw new AppError("لا يمكن اعتماد اختبار كل بنوده غير منطبقة");
    if (failed && !input.notes?.trim()) throw new AppError("سبب الفشل مطلوب");
    const round = (await tx.qualityTest.count({ where: { orderId } })) + 1;
    const test = await tx.qualityTest.create({
      data: { orderId, round, result, items: input.items, notes: input.notes, userId: ctx.userId },
    });
    if (result === "FAIL") await applyTransition(tx, ctx.userId, orderId, "REWORK", { system: true, note: `فشل الاختبار (جولة ${round}): ${input.notes}` });
    else if (result === "PASS") await applyTransition(tx, ctx.userId, orderId, "REPAIRED", { system: true, note: `اجتاز الاختبار (جولة ${round})` });
    // RECHECK: يبقى في انتظار الاختبار
    await audit(tx, ctx.userId, "qc.record", "QualityTest", test.id, { result, round });
    return test;
  });
}
