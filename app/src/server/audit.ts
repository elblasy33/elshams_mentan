import { prisma, Prisma, type Tx } from "./db";

export async function audit(
  tx: Tx | typeof prisma,
  userId: string | null,
  action: string,
  entity: string,
  entityId?: string | null,
  data?: Prisma.InputJsonValue,
) {
  await tx.auditLog.create({ data: { userId, action, entity, entityId: entityId ?? null, data } });
}
