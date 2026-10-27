import { prisma } from "../db";
import { type Ctx, need, can } from "../context";
import { financeOf } from "./orders";
import { ZERO } from "../money";
import type { OrderStatus } from "../../generated/prisma/client";

const startOfDay = (d = new Date()) => new Date(d.getFullYear(), d.getMonth(), d.getDate());

export async function dashboard(ctx: Ctx, days = 14) {
  need(ctx, "order.read");
  const scope = can(ctx, "order.read_all") ? {} : { technicianId: ctx.userId };
  const today = startOfDay();
  const since = new Date(today.getTime() - (days - 1) * 86400000);
  const money = can(ctx, "payment.read");

  const [byStatus, receivedToday, overdue, recent, perDay, byType, lowStock] = await Promise.all([
    prisma.serviceOrder.groupBy({ by: ["status"], where: scope, _count: true }),
    prisma.serviceOrder.count({ where: { ...scope, receivedAt: { gte: today } } }),
    prisma.serviceOrder.findMany({
      where: { ...scope, expectedAt: { lt: new Date() }, status: { notIn: ["DELIVERED", "CANCELLED", "READY_FOR_DELIVERY", "REJECTED"] } },
      orderBy: { expectedAt: "asc" }, take: 8,
      include: { customer: { select: { name: true } }, device: { include: { type: true } } },
    }),
    prisma.serviceOrder.findMany({ where: scope, orderBy: { receivedAt: "desc" }, take: 8, include: { customer: { select: { name: true } }, device: { include: { type: true } } } }),
    prisma.serviceOrder.findMany({ where: { ...scope, receivedAt: { gte: since } }, select: { receivedAt: true } }),
    prisma.serviceOrder.findMany({ where: scope, select: { device: { select: { type: { select: { nameAr: true } } } } } }),
    can(ctx, "stock.read") ? prisma.$queryRaw<{ id: string; code: string; name: string; onHand: string; reorderLevel: string }[]>`SELECT id, code, name, "onHand"::text, "reorderLevel"::text FROM "SparePart" WHERE active AND "onHand" <= "reorderLevel" ORDER BY code LIMIT 8` : Promise.resolve([]),
  ]);

  const counts = Object.fromEntries(byStatus.map((s) => [s.status, s._count])) as Partial<Record<OrderStatus, number>>;
  const series = Array.from({ length: days }, (_, i) => {
    const d = new Date(since.getTime() + i * 86400000);
    return { date: d.toISOString().slice(5, 10), count: perDay.filter((o) => startOfDay(o.receivedAt).getTime() === d.getTime()).length };
  });
  const typeCounts: Record<string, number> = {};
  for (const r of byType) typeCounts[r.device.type.nameAr] = (typeCounts[r.device.type.nameAr] ?? 0) + 1;

  let collectedToday = ZERO;
  let outstanding = ZERO;
  if (money) {
    const pays = await prisma.payment.findMany({ where: { createdAt: { gte: today } }, select: { kind: true, amount: true } });
    for (const p of pays) collectedToday = p.kind === "REFUND" ? collectedToday.minus(p.amount) : collectedToday.plus(p.amount);
    const open = await prisma.serviceOrder.findMany({
      where: { status: { notIn: ["CANCELLED", "RECEIVED", "AWAITING_INSPECTION", "INSPECTING", "AWAITING_QUOTE", "AWAITING_APPROVAL"] } },
      select: { id: true, status: true },
    });
    for (const o of open) {
      const f = await financeOf(prisma, o.id, o.status);
      if (f.balance.gt(0)) outstanding = outstanding.plus(f.balance);
    }
  }
  return {
    counts, receivedToday, overdue, recent, series,
    byType: Object.entries(typeCounts).map(([name, value]) => ({ name, value })),
    lowStock, collectedToday: money ? collectedToday : null, outstanding: money ? outstanding : null,
  };
}
