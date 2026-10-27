import { ZodError } from "zod";
import { AppError } from "./errors";
import { Prisma } from "./db";
import { requireCtx, createSession, destroySession } from "./session";
import { verifyLogin, createUser, updateUser } from "./services/users";
import { createCustomer, updateCustomer, archiveCustomer, listCustomers, listCustomerDevices } from "./services/customers";
import { createOrder, listOrders, getOrder, updateOrder, transition } from "./services/orders";
import { createQuotation, sendQuotation, approveQuotation, rejectQuotation } from "./services/quotations";
import { createPayment, refund, dailyCollections } from "./services/payments";
import { createPart, updatePart, receiveStock, issuePart, returnPart, adjustStock, listParts, listMovements } from "./services/inventory";
import { recordTest } from "./services/quality";
import { deliver } from "./services/delivery";
import { marginReport, technicianReport, partsUsage, toCsv } from "./services/reports";
import { prisma } from "./db";
import { need, type Ctx } from "./context";
import { audit } from "./audit";
import type { OrderStatus } from "../generated/prisma/client";

type H = (a: { ctx: Ctx; p: string[]; body: any; q: URLSearchParams; req: Request }) => Promise<unknown>;
const num = (v: string | null) => (v ? Number(v) : undefined);
const range = (q: URLSearchParams) => ({
  from: new Date((q.get("from") || new Date(Date.now() - 30 * 86400000).toISOString().slice(0, 10)) + "T00:00:00"),
  to: new Date((q.get("to") || new Date().toISOString().slice(0, 10)) + "T23:59:59"),
});

/** جدول التوجيه: "METHOD /path/:param" ← معالج. كل معالج يمر بخدمة تتحقق من الصلاحيات. */
const routes: [string, H][] = [
  ["GET /customers", ({ ctx, q }) => listCustomers(ctx, { search: q.get("search") ?? undefined, page: num(q.get("page")), archived: q.get("archived") === "1" })],
  ["POST /customers", ({ ctx, body }) => createCustomer(ctx, body)],
  ["PATCH /customers/:id", ({ ctx, p, body }) => updateCustomer(ctx, p[0], body)],
  ["POST /customers/:id/archive", ({ ctx, p, body }) => archiveCustomer(ctx, p[0], body?.archive !== false)],
  ["GET /customers/:id/devices", ({ ctx, p }) => listCustomerDevices(ctx, p[0])],
  ["GET /orders", ({ ctx, q }) => listOrders(ctx, { search: q.get("search") ?? undefined, status: q.get("status") ?? undefined, page: num(q.get("page")), overdue: q.get("overdue") === "1", technicianId: q.get("technicianId") ?? undefined, customerId: q.get("customerId") ?? undefined, from: q.get("from") ?? undefined, to: q.get("to") ?? undefined })],
  ["POST /orders", ({ ctx, body }) => createOrder(ctx, body)],
  ["GET /orders/:id", ({ ctx, p }) => getOrder(ctx, p[0])],
  ["PATCH /orders/:id", ({ ctx, p, body }) => updateOrder(ctx, p[0], body)],
  ["POST /orders/:id/transition", ({ ctx, p, body }) => transition(ctx, p[0], body.to as OrderStatus, body.note)],
  ["POST /orders/:id/quotations", ({ ctx, p, body }) => createQuotation(ctx, p[0], body)],
  ["POST /orders/:id/tests", ({ ctx, p, body }) => recordTest(ctx, p[0], body)],
  ["POST /orders/:id/deliver", ({ ctx, p, body }) => deliver(ctx, p[0], body)],
  ["POST /quotations/:id/send", ({ ctx, p }) => sendQuotation(ctx, p[0])],
  ["POST /quotations/:id/approve", ({ ctx, p, body }) => approveQuotation(ctx, p[0], body)],
  ["POST /quotations/:id/reject", ({ ctx, p, body }) => rejectQuotation(ctx, p[0], body?.reason)],
  ["POST /payments", ({ ctx, body }) => createPayment(ctx, body)],
  ["POST /refunds", ({ ctx, body }) => refund(ctx, body)],
  ["GET /payments", ({ ctx, q }) => { const r = range(q); return dailyCollections(ctx, r.from, r.to); }],
  ["GET /parts", ({ ctx, q }) => listParts(ctx, { search: q.get("search") ?? undefined, low: q.get("low") === "1", page: num(q.get("page")) })],
  ["POST /parts", ({ ctx, body }) => createPart(ctx, body)],
  ["PATCH /parts/:id", ({ ctx, p, body }) => updatePart(ctx, p[0], body)],
  ["GET /stock/movements", ({ ctx, q }) => listMovements(ctx, { partId: q.get("partId") ?? undefined, orderId: q.get("orderId") ?? undefined, page: num(q.get("page")) })],
  ["POST /stock/receive", ({ ctx, body }) => receiveStock(ctx, body)],
  ["POST /stock/issue", ({ ctx, body }) => issuePart(ctx, body)],
  ["POST /stock/return", ({ ctx, body }) => returnPart(ctx, body)],
  ["POST /stock/adjust", ({ ctx, body }) => adjustStock(ctx, body)],
  ["POST /users", ({ ctx, body }) => createUser(ctx, body)],
  ["PATCH /users/:id", ({ ctx, p, body }) => updateUser(ctx, p[0], body)],
  ["PUT /settings", async ({ ctx, body }) => {
    need(ctx, "settings.manage");
    for (const [key, value] of Object.entries(body ?? {})) await prisma.setting.upsert({ where: { key }, update: { value: value as never }, create: { key, value: value as never } });
    await audit(prisma, ctx.userId, "settings.update", "Setting", null, body);
    return { ok: true };
  }],
  ["GET /reports/:name", async ({ ctx, p, q }) => {
    const { from, to } = range(q);
    const data = p[0] === "margin" ? await marginReport(ctx, from, to) : p[0] === "technicians" ? await technicianReport(ctx, from, to) : p[0] === "parts" ? await partsUsage(ctx, from, to) : null;
    if (!data) throw new AppError("تقرير غير معروف", 404);
    if (q.get("format") === "csv") return new Response(toCsv(data as never), { headers: { "content-type": "text/csv; charset=utf-8", "content-disposition": `attachment; filename=${p[0]}.csv` } });
    return data;
  }],
];

const compiled = routes.map(([k, h]) => {
  const [method, path] = k.split(" ");
  const re = new RegExp("^" + path.replace(/:\w+/g, "([^/]+)") + "$");
  return { method, re, h };
});

function ser(v: unknown): unknown {
  return JSON.parse(JSON.stringify(v, (_k, x) => (x instanceof Prisma.Decimal ? x.toString() : x)));
}

export async function dispatch(req: Request, segs: string[]): Promise<Response> {
  const path = "/" + segs.join("/");
  const method = req.method;
  try {
    const url = new URL(req.url);
    // المصادقة
    if (method === "POST" && path === "/auth/login") {
      const b = await req.json();
      const ip = req.headers.get("x-forwarded-for")?.split(",")[0] ?? "local";
      const u = await verifyLogin(String(b.username ?? ""), String(b.password ?? ""), ip);
      await createSession(u.id);
      return Response.json({ ok: true });
    }
    if (method === "POST" && path === "/auth/logout") {
      await destroySession();
      return Response.json({ ok: true });
    }
    // حماية CSRF: الطلبات المعدِّلة يجب أن تأتي من نفس الأصل
    if (method !== "GET") {
      const origin = req.headers.get("origin");
      if (origin && new URL(origin).host !== req.headers.get("host")) throw new AppError("طلب غير مسموح (origin)", 403);
    }
    const ctx = await requireCtx();
    for (const r of compiled) {
      if (r.method !== method) continue;
      const m = r.re.exec(path);
      if (!m) continue;
      const body = method === "GET" ? undefined : await req.json().catch(() => ({}));
      const out = await r.h({ ctx, p: m.slice(1), body, q: url.searchParams, req });
      return out instanceof Response ? out : Response.json(ser(out));
    }
    throw new AppError("المسار غير موجود", 404, "NOT_FOUND");
  } catch (e) {
    if (e instanceof AppError) return Response.json({ error: e.message, code: e.code }, { status: e.status });
    if (e instanceof ZodError) return Response.json({ error: e.issues.map((i) => i.message).join("، "), code: "VALIDATION", fields: e.issues.map((i) => i.path.join(".")) }, { status: 422 });
    if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002") return Response.json({ error: "القيمة مكررة", code: "DUPLICATE" }, { status: 409 });
    console.error("[api]", method, path, e);
    return Response.json({ error: "حدث خطأ غير متوقع", code: "INTERNAL" }, { status: 500 });
  }
}
