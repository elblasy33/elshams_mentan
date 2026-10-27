import bcrypt from "bcryptjs";
import { prisma } from "@/server/db";
import { makeCtx } from "@/server/context";
import type { Role } from "@/generated/prisma/enums";

export async function resetDb() {
  const tables = await prisma.$queryRaw<{ tablename: string }[]>`SELECT tablename FROM pg_tables WHERE schemaname='public' AND tablename NOT LIKE '\_prisma%'`;
  await prisma.$executeRawUnsafe(`TRUNCATE ${tables.map((t) => `"${t.tablename}"`).join(",")} RESTART IDENTITY CASCADE`);
  for (const t of [["TV", "شاشة"], ["RECEIVER", "رسيفر"], ["REMOTE", "ريموت"]]) await prisma.deviceType.create({ data: { code: t[0], nameAr: t[1] } });
}

export async function mkUser(role: Role, username = role.toLowerCase()) {
  const u = await prisma.user.create({ data: { username, name: username, role, passwordHash: await bcrypt.hash("x", 4) } });
  return makeCtx(u);
}

export async function mkWorld() {
  await resetDb();
  const admin = await mkUser("ADMIN");
  const reception = await mkUser("RECEPTION");
  const tech = await mkUser("TECHNICIAN");
  const stock = await mkUser("INVENTORY");
  const cashier = await mkUser("CASHIER");
  const manager = await mkUser("MANAGER");
  const type = await prisma.deviceType.findFirstOrThrow({ where: { code: "TV" } });
  return { admin, reception, tech, stock, cashier, manager, type };
}
