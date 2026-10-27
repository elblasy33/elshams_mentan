import type { Role } from "../generated/prisma/enums";

export const ALL_PERMS = [
  "customer.read", "customer.write",
  "order.read", "order.read_all", "order.create", "order.transition", "order.diagnose", "order.assign", "order.cancel",
  "quote.write", "quote.approve",
  "payment.read", "payment.create", "payment.refund",
  "stock.read", "stock.manage", "stock.issue", "stock.adjust", "part.price",
  "qc.write", "delivery.perform", "delivery.override", "warranty.decide",
  "report.read", "audit.read", "user.manage", "settings.manage",
] as const;
export type Perm = (typeof ALL_PERMS)[number];

const reader: Perm[] = ["customer.read", "order.read", "order.read_all", "payment.read", "stock.read", "report.read", "audit.read"];

export const ROLE_PERMS: Record<Role, Perm[]> = {
  ADMIN: [...ALL_PERMS],
  MANAGER: ALL_PERMS.filter((p) => p !== "user.manage") as Perm[],
  RECEPTION: [
    "customer.read", "customer.write", "order.read", "order.read_all", "order.create", "order.assign", "order.transition",
    "quote.write", "quote.approve", "warranty.decide", "payment.read", "payment.create", "stock.read", "delivery.perform",
  ],
  TECHNICIAN: ["customer.read", "order.read", "order.transition", "order.diagnose", "quote.write", "stock.read", "stock.issue", "qc.write"],
  FIELD_TECHNICIAN: ["customer.read", "order.read", "order.transition", "order.diagnose", "stock.read"],
  INVENTORY: ["order.read", "order.read_all", "stock.read", "stock.manage", "stock.issue", "stock.adjust"],
  CASHIER: ["customer.read", "order.read", "order.read_all", "payment.read", "payment.create", "delivery.perform"],
  QC: ["customer.read", "order.read", "order.read_all", "order.transition", "qc.write", "stock.read"],
  AUDITOR: reader,
};

export const ROLE_LABEL: Record<Role, string> = {
  ADMIN: "مدير النظام",
  MANAGER: "مدير",
  RECEPTION: "استقبال",
  TECHNICIAN: "فني",
  FIELD_TECHNICIAN: "فني ميداني",
  INVENTORY: "أمين مخزن",
  CASHIER: "كاشير",
  QC: "مراقب جودة",
  AUDITOR: "مراجع (قراءة فقط)",
};
