export const L = {
  customerType: { INDIVIDUAL: "فرد", SHOP: "محل / تاجر", COMPANY: "شركة", COMMERCIAL: "جهة تجارية" },
  channel: { BRANCH: "استلام داخل الفرع", PICKUP: "استلام من عنوان العميل", COMMERCIAL: "استلام تجاري", OTHER: "مصدر آخر" },
  mode: { INTERNAL: "صيانة داخلية", FIELD: "صيانة ميدانية", EXTERNAL: "صيانة خارجية" },
  priority: { NORMAL: "عادية", HIGH: "مرتفعة", URGENT: "عاجلة" },
  method: { CASH: "نقدي", BANK_TRANSFER: "تحويل بنكي", WALLET: "محفظة إلكترونية", CARD: "بطاقة", OTHER: "أخرى" },
  payKind: { DEPOSIT: "عربون", PAYMENT: "دفعة", REFUND: "مرتجع" },
  payStatus: { UNPAID: "غير مدفوع", PARTIAL: "مدفوع جزئيًا", PAID: "مدفوع بالكامل", CREDIT: "رصيد دائن للعميل", DEPOSIT_ONLY: "عربون مقدم" },
  quote: { DRAFT: "مسودة", SENT: "في انتظار الموافقة", APPROVED: "موافق عليه", REJECTED: "مرفوض", EXPIRED: "منتهي الصلاحية", SUPERSEDED: "تم استبداله" },
  line: { INSPECTION: "رسوم فحص", LABOR: "مصنعية", PART: "قطعة غيار", SERVICE: "خدمة إضافية" },
  move: { RECEIPT: "استلام", ISSUE: "صرف", RETURN: "مرتجع للمخزن", ADJUSTMENT: "تسوية جرد", DAMAGE: "تالف" },
  test: { PASS: "ناجح", FAIL: "فاشل", RECHECK: "يحتاج إعادة فحص", NA: "غير منطبق" },
  approval: { PHONE: "هاتف", WHATSAPP: "واتساب", IN_PERSON: "حضوريًا", OTHER: "أخرى" },
  role: { ADMIN: "مدير النظام", MANAGER: "مدير", RECEPTION: "استقبال", TECHNICIAN: "فني", FIELD_TECHNICIAN: "فني ميداني", INVENTORY: "أمين مخزن", CASHIER: "كاشير", QC: "مراقب جودة", AUDITOR: "مراجع (قراءة فقط)" },
} as const;

export const STATUS_LABEL: Record<string, string> = {
  RECEIVED: "تم الاستلام", AWAITING_INSPECTION: "في انتظار الفحص", INSPECTING: "جاري الفحص", AWAITING_QUOTE: "في انتظار عرض السعر",
  AWAITING_APPROVAL: "في انتظار موافقة العميل", AWAITING_PARTS: "في انتظار قطع الغيار", READY_TO_REPAIR: "جاهز للإصلاح", REPAIRING: "جاري الإصلاح",
  AWAITING_TEST: "في انتظار الاختبار", REWORK: "إعادة للإصلاح", REPAIRED: "تم الإصلاح", READY_FOR_DELIVERY: "جاهز للتسليم",
  DELIVERED: "تم التسليم", REJECTED: "مرفوض من العميل", CANCELLED: "ملغي",
};
export const STATUS_TONE: Record<string, string> = {
  RECEIVED: "bg-slate-100 text-slate-700", AWAITING_INSPECTION: "bg-slate-100 text-slate-700", INSPECTING: "bg-blue-50 text-blue-700",
  AWAITING_QUOTE: "bg-amber-50 text-amber-700", AWAITING_APPROVAL: "bg-amber-50 text-amber-700", AWAITING_PARTS: "bg-orange-50 text-orange-700",
  READY_TO_REPAIR: "bg-indigo-50 text-indigo-700", REPAIRING: "bg-blue-50 text-blue-700", AWAITING_TEST: "bg-violet-50 text-violet-700",
  REWORK: "bg-red-50 text-red-700", REPAIRED: "bg-emerald-50 text-emerald-700", READY_FOR_DELIVERY: "bg-emerald-100 text-emerald-800",
  DELIVERED: "bg-emerald-600 text-white", REJECTED: "bg-rose-50 text-rose-700", CANCELLED: "bg-slate-200 text-slate-600",
};
// الانتقالات اليدوية المتاحة في الواجهة (مطابقة لـ server/workflow.ts دون الانتقالات النظامية)
export const NEXT_ACTIONS: Record<string, { to: string; label: string; danger?: boolean }[]> = {
  RECEIVED: [{ to: "AWAITING_INSPECTION", label: "تحويل لقائمة الفحص" }, { to: "CANCELLED", label: "إلغاء الأمر", danger: true }],
  AWAITING_INSPECTION: [{ to: "INSPECTING", label: "بدء الفحص" }, { to: "CANCELLED", label: "إلغاء الأمر", danger: true }],
  INSPECTING: [{ to: "AWAITING_QUOTE", label: "إنهاء الفحص وطلب التسعير" }, { to: "CANCELLED", label: "إلغاء الأمر", danger: true }],
  AWAITING_QUOTE: [{ to: "CANCELLED", label: "إلغاء الأمر", danger: true }],
  AWAITING_APPROVAL: [{ to: "AWAITING_QUOTE", label: "إعادة للتسعير (تعديل العرض)" }, { to: "CANCELLED", label: "إلغاء الأمر", danger: true }],
  AWAITING_PARTS: [{ to: "READY_TO_REPAIR", label: "توفرت القطع — جاهز للإصلاح" }, { to: "CANCELLED", label: "إلغاء الأمر", danger: true }],
  READY_TO_REPAIR: [{ to: "REPAIRING", label: "بدء الإصلاح" }, { to: "AWAITING_PARTS", label: "في انتظار قطع غيار" }, { to: "CANCELLED", label: "إلغاء الأمر", danger: true }],
  REPAIRING: [{ to: "AWAITING_TEST", label: "إنهاء الإصلاح وإرسال للاختبار" }, { to: "AWAITING_PARTS", label: "في انتظار قطع غيار" }, { to: "AWAITING_QUOTE", label: "ظهور عطل إضافي — طلب تسعير جديد" }, { to: "CANCELLED", label: "إلغاء الأمر", danger: true }],
  REWORK: [{ to: "REPAIRING", label: "إعادة الإصلاح" }, { to: "AWAITING_QUOTE", label: "طلب تسعير جديد" }],
  REPAIRED: [{ to: "READY_FOR_DELIVERY", label: "جاهز للتسليم" }, { to: "AWAITING_TEST", label: "إعادة الاختبار" }],
  REJECTED: [{ to: "READY_FOR_DELIVERY", label: "تجهيز الجهاز للتسليم دون إصلاح" }],
};
