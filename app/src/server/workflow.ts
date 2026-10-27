import type { OrderStatus } from "../generated/prisma/enums";

export const STATUS_LABEL: Record<OrderStatus, string> = {
  RECEIVED: "تم الاستلام",
  AWAITING_INSPECTION: "في انتظار الفحص",
  INSPECTING: "جاري الفحص",
  AWAITING_QUOTE: "في انتظار إعداد عرض السعر",
  AWAITING_APPROVAL: "في انتظار موافقة العميل",
  AWAITING_PARTS: "في انتظار توفير قطع الغيار",
  READY_TO_REPAIR: "جاهز للإصلاح",
  REPAIRING: "جاري الإصلاح",
  AWAITING_TEST: "في انتظار الاختبار",
  REWORK: "إعادة للإصلاح",
  REPAIRED: "تم الإصلاح",
  READY_FOR_DELIVERY: "جاهز للتسليم",
  DELIVERED: "تم التسليم",
  REJECTED: "مرفوض من العميل",
  CANCELLED: "ملغي",
};

export const TERMINAL: OrderStatus[] = ["DELIVERED", "CANCELLED"];

/**
 * الانتقالات المسموحة. `system` = لا تُنفَّذ يدويًا؛ تتم فقط عبر الإجراء المسؤول
 * (اعتماد/رفض عرض السعر، نتيجة الاختبار، التسليم) حتى لا تُتجاوز شروطه.
 */
export const EDGES: Record<OrderStatus, { to: OrderStatus; system?: boolean }[]> = {
  RECEIVED: [{ to: "AWAITING_INSPECTION" }, { to: "CANCELLED" }],
  AWAITING_INSPECTION: [{ to: "INSPECTING" }, { to: "CANCELLED" }],
  INSPECTING: [{ to: "AWAITING_QUOTE" }, { to: "CANCELLED" }],
  AWAITING_QUOTE: [{ to: "AWAITING_APPROVAL", system: true }, { to: "CANCELLED" }],
  AWAITING_APPROVAL: [
    { to: "READY_TO_REPAIR", system: true },
    { to: "REJECTED", system: true },
    { to: "AWAITING_QUOTE" },
    { to: "CANCELLED" },
  ],
  AWAITING_PARTS: [{ to: "READY_TO_REPAIR" }, { to: "CANCELLED" }],
  READY_TO_REPAIR: [{ to: "REPAIRING" }, { to: "AWAITING_PARTS" }, { to: "CANCELLED" }],
  REPAIRING: [{ to: "AWAITING_TEST" }, { to: "AWAITING_PARTS" }, { to: "AWAITING_QUOTE" }, { to: "CANCELLED" }],
  AWAITING_TEST: [{ to: "REPAIRED", system: true }, { to: "REWORK", system: true }],
  REWORK: [{ to: "REPAIRING" }, { to: "AWAITING_QUOTE" }],
  REPAIRED: [{ to: "READY_FOR_DELIVERY" }, { to: "AWAITING_TEST" }],
  REJECTED: [{ to: "READY_FOR_DELIVERY" }],
  READY_FOR_DELIVERY: [{ to: "DELIVERED", system: true }],
  DELIVERED: [],
  CANCELLED: [],
};

export function allowedNext(from: OrderStatus, includeSystem = false) {
  return EDGES[from].filter((e) => includeSystem || !e.system).map((e) => e.to);
}
