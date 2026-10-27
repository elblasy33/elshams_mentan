import { prisma } from "../db";
import { type Ctx, need } from "../context";
import { financeOf, approvedQuote } from "./orders";
import { ZERO, round2 } from "../money";

export async function marginReport(ctx: Ctx, from: Date, to: Date) {
  need(ctx, "report.read");
  const orders = await prisma.serviceOrder.findMany({
    where: { deliveredAt: { gte: from, lte: to } },
    include: { customer: { select: { name: true } }, parts: true },
    orderBy: { deliveredAt: "desc" },
  });
  const rows = [];
  for (const o of orders) {
    const q = await approvedQuote(prisma, o.id);
    const f = await financeOf(prisma, o.id, o.status);
    const revenue = q ? q.subtotal.minus(q.discount) : f.due; // قبل الضريبة
    // تكلفة القطع الفعلية = تكلفة المصروف الصافي + التالف (لا نفترض بيانات تكلفة المصنعية)
    const partsCost = o.parts.reduce((s, p) => s.plus(p.costTotal), ZERO);
    rows.push({ number: o.number, customer: o.customer.name, deliveredAt: o.deliveredAt, revenue: round2(revenue), partsCost: round2(partsCost), margin: round2(revenue.minus(partsCost)), collected: f.net });
  }
  return rows;
}

export async function technicianReport(ctx: Ctx, from: Date, to: Date) {
  need(ctx, "report.read");
  const techs = await prisma.user.findMany({ where: { role: { in: ["TECHNICIAN", "FIELD_TECHNICIAN"] } }, select: { id: true, name: true } });
  const out = [];
  for (const t of techs) {
    const orders = await prisma.serviceOrder.findMany({ where: { technicianId: t.id, receivedAt: { gte: from, lte: to } }, include: { tests: { orderBy: { round: "asc" } } } });
    const done = orders.filter((o) => o.status === "DELIVERED");
    const tested = orders.filter((o) => o.tests.length);
    const firstPass = tested.filter((o) => o.tests[0].result === "PASS").length;
    out.push({ name: t.name, total: orders.length, delivered: done.length, reworks: orders.filter((o) => o.tests.some((x) => x.result === "FAIL")).length, firstPassRate: tested.length ? Math.round((firstPass / tested.length) * 100) : null });
  }
  return out;
}

export async function partsUsage(ctx: Ctx, from: Date, to: Date) {
  need(ctx, "report.read");
  const rows = await prisma.stockMovement.groupBy({ by: ["partId", "type"], where: { createdAt: { gte: from, lte: to }, type: { in: ["ISSUE", "RETURN", "DAMAGE"] } }, _sum: { qtyDelta: true } });
  const parts = await prisma.sparePart.findMany({ where: { id: { in: [...new Set(rows.map((r) => r.partId))] } } });
  return parts.map((p) => {
    const get = (t: string) => rows.find((r) => r.partId === p.id && r.type === t)?._sum.qtyDelta ?? ZERO;
    return { code: p.code, name: p.name, issued: get("ISSUE").neg(), returned: get("RETURN") };
  });
}

export function toCsv(rows: Record<string, unknown>[]) {
  if (!rows.length) return "﻿";
  const keys = Object.keys(rows[0]);
  const esc = (v: unknown) => {
    let s = v instanceof Date ? v.toISOString() : String(v ?? "");
    if (/^[=+\-@]/.test(s)) s = "'" + s; // حماية من حقن الصيغ في Excel
    return `"${s.replace(/"/g, '""')}"`;
  };
  return "﻿" + [keys.join(","), ...rows.map((r) => keys.map((k) => esc(r[k])).join(","))].join("\r\n");
}
