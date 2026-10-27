import { Download } from "lucide-react";
import { requireCtx } from "@/server/session";
import { marginReport, technicianReport, partsUsage } from "@/server/services/reports";
import { Card, PageHeader, Empty, Table, Td, btn, input, Num } from "@/components/ui";
import { d, money } from "@/lib/format";

export default async function Reports({ searchParams }: { searchParams: Promise<{ from?: string; to?: string }> }) {
  const sp = await searchParams;
  const ctx = await requireCtx();
  const from = sp.from || new Date(Date.now() - 30 * 86400000).toISOString().slice(0, 10);
  const to = sp.to || new Date().toISOString().slice(0, 10);
  const F = new Date(from + "T00:00:00"), T = new Date(to + "T23:59:59");
  const [margin, techs, parts] = await Promise.all([marginReport(ctx, F, T), technicianReport(ctx, F, T), partsUsage(ctx, F, T)]);
  const q = `from=${from}&to=${to}&format=csv`;
  return (
    <>
      <PageHeader title="التقارير" sub="تعتمد على السجلات الفعلية فقط. هامش المساهمة التقديري ≠ صافي الربح (لا تُحتسب تكلفة المصنعية)." />
      <Card className="mb-4">
        <form className="flex flex-wrap items-end gap-2">
          <label className="text-xs font-semibold">من<input type="date" name="from" defaultValue={from} className={`${input} mt-1`} /></label>
          <label className="text-xs font-semibold">إلى<input type="date" name="to" defaultValue={to} className={`${input} mt-1`} /></label>
          <button className={btn.primary}>تطبيق</button>
        </form>
      </Card>
      <div className="space-y-4">
        <Card title="هامش المساهمة التقديري للأوامر المسلّمة" action={<a className={btn.ghost} href={`/api/reports/margin?${q}`}><Download size={14} />CSV</a>}>
          {margin.length === 0 ? <Empty title="لا توجد أوامر مسلّمة في الفترة" /> : (
            <Table head={["الأمر", "العميل", "التسليم", "الإيراد (قبل الضريبة)", "تكلفة القطع الفعلية", "هامش المساهمة", "المحصَّل"]}>
              {margin.map((r) => <tr key={r.number}><Td><Num>{r.number}</Num></Td><Td>{r.customer}</Td><Td>{d(r.deliveredAt)}</Td><Td><Num>{money(r.revenue)}</Num></Td><Td><Num>{money(r.partsCost)}</Num></Td><Td className="font-bold"><Num>{money(r.margin)}</Num></Td><Td><Num>{money(r.collected)}</Num></Td></tr>)}
            </Table>
          )}
        </Card>
        <Card title="أداء الفنيين" action={<a className={btn.ghost} href={`/api/reports/technicians?${q}`}><Download size={14} />CSV</a>}>
          {techs.length === 0 ? <Empty title="لا يوجد فنيون" /> : (
            <Table head={["الفني", "الأوامر", "المسلّمة", "حالات فشل اختبار", "نجاح من أول اختبار"]}>
              {techs.map((t) => <tr key={t.name}><Td>{t.name}</Td><Td><Num>{t.total}</Num></Td><Td><Num>{t.delivered}</Num></Td><Td><Num>{t.reworks}</Num></Td><Td>{t.firstPassRate === null ? "غير متاح" : <Num>{t.firstPassRate}%</Num>}</Td></tr>)}
            </Table>
          )}
        </Card>
        <Card title="استخدام قطع الغيار" action={<a className={btn.ghost} href={`/api/reports/parts?${q}`}><Download size={14} />CSV</a>}>
          {parts.length === 0 ? <Empty title="لا توجد حركات صرف" /> : (
            <Table head={["الكود", "القطعة", "مصروف", "مرتجع"]}>
              {parts.map((p) => <tr key={p.code}><Td><Num>{p.code}</Num></Td><Td>{p.name}</Td><Td><Num>{p.issued.toString()}</Num></Td><Td><Num>{p.returned.toString()}</Num></Td></tr>)}
            </Table>
          )}
        </Card>
      </div>
    </>
  );
}
