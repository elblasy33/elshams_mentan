const nf = new Intl.NumberFormat("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
export const money = (v: unknown) => `${nf.format(Number(v ?? 0))} ج.م`;
export const qty = (v: unknown) => String(Number(v ?? 0));
const tz = "Africa/Cairo";
// صيغة LTR ثابتة (YYYY/MM/DD HH:mm) لتفادي اختلاط اتجاه النص العربي مع الأرقام
function parts(v: Date) {
  const f = new Intl.DateTimeFormat("en-GB", { timeZone: tz, year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", hour12: false });
  return Object.fromEntries(f.formatToParts(v).map((x) => [x.type, x.value])) as Record<string, string>;
}
export const d = (v: unknown) => { if (!v) return "—"; const p = parts(new Date(v as string)); return `${p.year}/${p.month}/${p.day}`; };
export const dt = (v: unknown) => { if (!v) return "—"; const p = parts(new Date(v as string)); return `${p.year}/${p.month}/${p.day} ${p.hour}:${p.minute}`; };
export const dInput = (v: unknown) => (v ? new Date(v as string).toISOString().slice(0, 10) : "");
