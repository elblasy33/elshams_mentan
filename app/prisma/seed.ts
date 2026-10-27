import "dotenv/config";
import bcrypt from "bcryptjs";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../src/generated/prisma/client";

const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL! }) });

const DEVICE_TYPES = [
  { code: "TV", nameAr: "شاشة / تلفزيون" },
  { code: "RECEIVER", nameAr: "رسيفر" },
  { code: "REMOTE", nameAr: "ريموت كنترول", hasSerial: false },
  { code: "OTHER", nameAr: "جهاز إلكتروني آخر" },
];

async function main() {
  for (const t of DEVICE_TYPES) await prisma.deviceType.upsert({ where: { code: t.code }, update: {}, create: t });

  const adminUser = process.env.ADMIN_USERNAME;
  const adminPass = process.env.ADMIN_PASSWORD;
  if (adminUser && adminPass) {
    if (adminPass.length < 8) throw new Error("ADMIN_PASSWORD قصيرة");
    await prisma.user.upsert({
      where: { username: adminUser.toLowerCase() },
      update: {},
      create: { username: adminUser.toLowerCase(), name: "مدير النظام", role: "ADMIN", passwordHash: await bcrypt.hash(adminPass, 12) },
    });
    console.log("admin ready:", adminUser);
  } else console.log("لم يُنشأ مدير: مرّر ADMIN_USERNAME و ADMIN_PASSWORD");

  // بيانات تجريبية للتطوير فقط
  if (process.env.SEED_DEMO === "1") {
    const hash = await bcrypt.hash("Demo@12345", 10);
    const users = [
      ["manager", "المدير", "MANAGER"], ["reception", "موظف الاستقبال", "RECEPTION"], ["tech1", "فني ١ (تجريبي)", "TECHNICIAN"],
      ["stock", "أمين المخزن", "INVENTORY"], ["cashier", "الكاشير", "CASHIER"], ["auditor", "المراجع", "AUDITOR"],
    ] as const;
    for (const [username, name, role] of users)
      await prisma.user.upsert({ where: { username }, update: {}, create: { username, name: `${name}`, role, passwordHash: hash } });
    console.log("demo users created (password Demo@12345) — DEV ONLY");
    if (process.env.SEED_DEMO_DATA === "1") await (await import("./demo")).seedDemo();
  }
}
main().finally(() => prisma.$disconnect());
