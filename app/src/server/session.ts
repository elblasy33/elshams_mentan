import { SignJWT, jwtVerify } from "jose";
import { cookies } from "next/headers";
import { prisma } from "./db";
import { makeCtx, type Ctx } from "./context";
import { AppError } from "./errors";

const COOKIE = "shs_session";
const secret = () => {
  const s = process.env.SESSION_SECRET;
  if (!s || s.length < 32) throw new Error("SESSION_SECRET غير مضبوط (32 حرفًا على الأقل)");
  return new TextEncoder().encode(s);
};

export async function createSession(userId: string) {
  const token = await new SignJWT({ uid: userId }).setProtectedHeader({ alg: "HS256" }).setIssuedAt().setExpirationTime("12h").sign(secret());
  (await cookies()).set(COOKIE, token, { httpOnly: true, sameSite: "lax", secure: process.env.COOKIE_SECURE === "true", path: "/", maxAge: 12 * 3600 });
}
export async function destroySession() {
  (await cookies()).delete(COOKIE);
}

/** يعيد سياق المستخدم من قاعدة البيانات في كل طلب (يُلغى تعطيل المستخدم فورًا). */
export async function getCtx(): Promise<Ctx | null> {
  const token = (await cookies()).get(COOKIE)?.value;
  if (!token) return null;
  try {
    const { payload } = await jwtVerify(token, secret());
    const user = await prisma.user.findUnique({ where: { id: payload.uid as string } });
    if (!user || !user.active) return null;
    return { ...makeCtx(user) };
  } catch {
    return null;
  }
}
export async function requireCtx(): Promise<Ctx> {
  const c = await getCtx();
  if (!c) throw new AppError("يلزم تسجيل الدخول", 401, "UNAUTHENTICATED");
  return c;
}
export async function currentUser() {
  const c = await getCtx();
  if (!c) return null;
  const user = await prisma.user.findUnique({ where: { id: c.userId }, select: { id: true, name: true, username: true, role: true } });
  return user && { ...user, ctx: c };
}
