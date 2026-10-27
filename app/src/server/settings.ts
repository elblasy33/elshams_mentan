import { prisma, type Tx } from "./db";

export const DEFAULT_SETTINGS = {
  companyName: "شركة الشمس للإلكترونيات الحديثة",
  companyPhone: "",
  companyAddress: "",
  currency: "EGP",
  allowNegativeStock: false,
  defaultWarrantyMonths: 3,
  quoteValidityDays: 7,
  taxRate: 0,
  deliveryTerms: "لا تُسلَّم الأجهزة إلا بعد سداد المستحقات. تُحتسب غرامة تخزين على الأجهزة غير المستلمة بعد 90 يومًا.",
};
export type Settings = typeof DEFAULT_SETTINGS;

export async function getSettings(tx: Tx | typeof prisma = prisma): Promise<Settings> {
  const rows = await tx.setting.findMany();
  const out: Record<string, unknown> = { ...DEFAULT_SETTINGS };
  for (const r of rows) out[r.key] = r.value;
  return out as Settings;
}
