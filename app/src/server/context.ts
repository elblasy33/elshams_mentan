import type { Role } from "../generated/prisma/enums";
import { ROLE_PERMS, type Perm } from "./permissions";
import { forbidden } from "./errors";

export interface Ctx {
  userId: string;
  role: Role;
  perms: Set<string>;
}

export function makeCtx(user: { id: string; role: Role; extraPerms: string[] }): Ctx {
  return { userId: user.id, role: user.role, perms: new Set([...ROLE_PERMS[user.role], ...user.extraPerms]) };
}

export function need(ctx: Ctx, perm: Perm) {
  if (!ctx.perms.has(perm)) throw forbidden();
}
export const can = (ctx: Ctx, perm: Perm) => ctx.perms.has(perm);
