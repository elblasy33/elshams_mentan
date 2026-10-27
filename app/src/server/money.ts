import { D, Prisma } from "./db";

export const ZERO = D(0);
export const round2 = (v: Prisma.Decimal) => v.toDecimalPlaces(2, Prisma.Decimal.ROUND_HALF_UP);

/** المتبقي = المستحق المعتمد − (الدفعات − المرتجعات). القيمة السالبة = رصيد دائن. */
export function balanceOf(approvedTotal: Prisma.Decimal, payments: { kind: string; amount: Prisma.Decimal }[]) {
  let net = ZERO;
  for (const p of payments) net = p.kind === "REFUND" ? net.minus(p.amount) : net.plus(p.amount);
  const balance = round2(approvedTotal.minus(net));
  let status: "UNPAID" | "PARTIAL" | "PAID" | "CREDIT" | "DEPOSIT_ONLY";
  if (approvedTotal.isZero()) status = net.gt(0) ? "DEPOSIT_ONLY" : "UNPAID";
  else if (net.lte(0)) status = "UNPAID";
  else if (net.lt(approvedTotal)) status = "PARTIAL";
  else if (net.eq(approvedTotal)) status = "PAID";
  else status = "CREDIT";
  return { net: round2(net), balance, status };
}
