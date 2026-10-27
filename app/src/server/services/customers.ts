import { z } from "zod";
import { prisma, D, type Prisma } from "../db";
import { AppError, notFound } from "../errors";
import { type Ctx, need } from "../context";
import { audit } from "../audit";
import { nextNumber } from "../numbering";
import { financeOf } from "./orders";
import { ZERO } from "../money";

const normPhone = (p: string) => p.replace(/[\s\-()]/g, "").replace(/[٠-٩]/g, (d) => String("٠١٢٣٤٥٦٧٨٩".indexOf(d)));

const schema = z.object({
  name: z.string().trim().min(2, "الاسم مطلوب"),
  type: z.enum(["INDIVIDUAL", "SHOP", "COMPANY", "COMMERCIAL"]).default("INDIVIDUAL"),
  phone: z.string().trim().min(7, "رقم الموبايل غير صحيح").transform(normPhone),
  phone2: z.string().trim().optional().transform((v) => (v ? normPhone(v) : undefined)),
  email: z.string().trim().email("بريد غير صحيح").optional().or(z.literal("")),
  address: z.string().trim().optional(),
  taxNo: z.string().trim().optional(),
  notes: z.string().trim().optional(),
  force: z.boolean().optional(),
});

export async function createCustomer(ctx: Ctx, raw: unknown) {
  need(ctx, "customer.write");
  const { force, ...input } = schema.parse(raw);
  if (!force) {
    const dup = await prisma.customer.findFirst({ where: { OR: [{ phone: input.phone }, { phone2: input.phone }] } });
    if (dup) throw new AppError(`يوجد عميل بنفس الرقم: ${dup.name} (${dup.code})`, 409, "DUPLICATE_CUSTOMER");
  }
  return prisma.$transaction(async (tx) => {
    const c = await tx.customer.create({ data: { ...input, email: input.email || null, code: await nextNumber(tx, "C", false) } });
    await audit(tx, ctx.userId, "customer.create", "Customer", c.id, { code: c.code });
    return c;
  });
}

export async function updateCustomer(ctx: Ctx, id: string, raw: unknown) {
  need(ctx, "customer.write");
  const { force: _f, ...input } = schema.partial().parse(raw);
  const c = await prisma.customer.update({ where: { id }, data: { ...input, email: input.email || null } });
  await audit(prisma, ctx.userId, "customer.update", "Customer", id);
  return c;
}

export async function archiveCustomer(ctx: Ctx, id: string, archive: boolean) {
  need(ctx, "customer.write");
  const c = await prisma.customer.update({ where: { id }, data: { archivedAt: archive ? new Date() : null } });
  await audit(prisma, ctx.userId, archive ? "customer.archive" : "customer.restore", "Customer", id);
  return c;
}

export async function listCustomers(ctx: Ctx, q: { search?: string; page?: number; archived?: boolean }) {
  need(ctx, "customer.read");
  const page = Math.max(1, q.page ?? 1);
  const s = q.search?.trim();
  const where: Prisma.CustomerWhereInput = {
    archivedAt: q.archived ? { not: null } : null,
    ...(s && { OR: [{ name: { contains: s, mode: "insensitive" } }, { phone: { contains: normPhone(s) } }, { phone2: { contains: normPhone(s) } }, { code: { contains: s, mode: "insensitive" } }] }),
  };
  const [total, items] = await Promise.all([
    prisma.customer.count({ where }),
    prisma.customer.findMany({ where, orderBy: { createdAt: "desc" }, skip: (page - 1) * 20, take: 20, include: { _count: { select: { orders: true } } } }),
  ]);
  return { items, total, page, pages: Math.ceil(total / 20) };
}

export async function getCustomer(ctx: Ctx, id: string) {
  need(ctx, "customer.read");
  const c = await prisma.customer.findUnique({
    where: { id },
    include: {
      devices: { include: { type: true }, orderBy: { createdAt: "desc" } },
      orders: { orderBy: { receivedAt: "desc" }, include: { device: { include: { type: true } } } },
      warranties: { where: { endsAt: { gte: new Date() } }, include: { device: { include: { type: true } } } },
    },
  });
  if (!c) throw notFound("العميل غير موجود");
  let outstanding = ZERO;
  let spend = ZERO;
  for (const o of c.orders) {
    if (o.status === "CANCELLED") continue;
    const f = await financeOf(prisma, o.id, o.status);
    if (f.balance.gt(0)) outstanding = outstanding.plus(f.balance);
    if (o.status === "DELIVERED") spend = spend.plus(f.net);
  }
  return { ...c, outstanding, spend, complaints: c.orders.length };
}

export async function listDeviceTypes() {
  const order = ["TV", "RECEIVER", "REMOTE", "OTHER"];
  const all = await prisma.deviceType.findMany();
  return all.sort((a, b) => (order.indexOf(a.code) + 1 || 99) - (order.indexOf(b.code) + 1 || 99));
}

export async function listCustomerDevices(ctx: Ctx, customerId: string) {
  need(ctx, "customer.read");
  return prisma.customerDevice.findMany({ where: { customerId }, include: { type: true }, orderBy: { createdAt: "desc" } });
}
export { D };
