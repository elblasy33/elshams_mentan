import { z } from "zod";
import bcrypt from "bcryptjs";
import { prisma } from "../db";
import { AppError } from "../errors";
import { type Ctx, need } from "../context";
import { audit } from "../audit";

const pw = z.string().min(8, "كلمة المرور 8 أحرف على الأقل");
const createSchema = z.object({
  username: z.string().trim().toLowerCase().min(3, "اسم المستخدم 3 أحرف على الأقل"),
  name: z.string().trim().min(2),
  password: pw,
  role: z.enum(["ADMIN", "MANAGER", "RECEPTION", "TECHNICIAN", "FIELD_TECHNICIAN", "INVENTORY", "CASHIER", "QC", "AUDITOR"]),
  extraPerms: z.array(z.string()).default([]),
});

export async function createUser(ctx: Ctx, raw: unknown) {
  need(ctx, "user.manage");
  const input = createSchema.parse(raw);
  if (await prisma.user.findUnique({ where: { username: input.username } })) throw new AppError("اسم المستخدم مستخدم بالفعل", 409);
  const { password, ...rest } = input;
  const u = await prisma.user.create({ data: { ...rest, passwordHash: await bcrypt.hash(password, 12) } });
  await audit(prisma, ctx.userId, "user.create", "User", u.id, { role: u.role });
  return { id: u.id, username: u.username };
}

export async function updateUser(ctx: Ctx, id: string, raw: unknown) {
  need(ctx, "user.manage");
  const input = z.object({ name: z.string().min(2).optional(), role: createSchema.shape.role.optional(), active: z.boolean().optional(), password: pw.optional(), extraPerms: z.array(z.string()).optional() }).parse(raw);
  if (id === ctx.userId && (input.active === false || (input.role && input.role !== ctx.role))) throw new AppError("لا يمكنك تعطيل نفسك أو تغيير دورك");
  const { password, ...rest } = input;
  await prisma.user.update({ where: { id }, data: { ...rest, ...(password && { passwordHash: await bcrypt.hash(password, 12) }) } });
  await audit(prisma, ctx.userId, "user.update", "User", id, { fields: Object.keys(input).filter((k) => k !== "password"), passwordChanged: !!password });
}

export async function listUsers(ctx: Ctx) {
  need(ctx, "user.manage");
  return prisma.user.findMany({ select: { id: true, username: true, name: true, role: true, active: true, extraPerms: true, createdAt: true }, orderBy: { createdAt: "asc" } });
}

export async function listStaff(ctx: Ctx) {
  need(ctx, "order.read");
  return prisma.user.findMany({ where: { active: true, role: { in: ["TECHNICIAN", "FIELD_TECHNICIAN", "MANAGER", "ADMIN"] } }, select: { id: true, name: true }, orderBy: { name: "asc" } });
}

const attempts = new Map<string, { n: number; until: number }>();

export async function verifyLogin(username: string, password: string, ip: string) {
  const key = `${username.toLowerCase()}|${ip}`;
  const a = attempts.get(key);
  if (a && a.n >= 5 && a.until > Date.now()) throw new AppError("محاولات كثيرة؛ حاول بعد 15 دقيقة", 429, "RATE_LIMIT");
  const user = await prisma.user.findUnique({ where: { username: username.trim().toLowerCase() } });
  // مقارنة وهمية لتقليل الفروق الزمنية عند عدم وجود المستخدم
  const ok = await bcrypt.compare(password, user?.passwordHash ?? "$2b$12$invalidinvalidinvalidinvalidinvalidinvalidinvalidinvali");
  if (!user || !user.active || !ok) {
    attempts.set(key, { n: (a && a.until > Date.now() ? a.n : 0) + 1, until: Date.now() + 15 * 60_000 });
    await audit(prisma, user?.id ?? null, "auth.login_failed", "User", user?.id, { username });
    throw new AppError("بيانات الدخول غير صحيحة", 401, "BAD_CREDENTIALS");
  }
  attempts.delete(key);
  await audit(prisma, user.id, "auth.login", "User", user.id);
  return user;
}
