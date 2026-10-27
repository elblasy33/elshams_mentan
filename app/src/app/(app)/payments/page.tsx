import { requireCtx } from "@/server/session";
import { dailyCollections } from "@/server/services/payments";
import { Card, PageHeader, Stat, Empty, Table, Td, Pill, btn, input, Num } from "@/components/ui";
import { L } from "@/lib/labels";
import { dt, money } from "@/lib/format";

export default async function Payments({ searchParams }: { searchParams: Promise<{ from?: string; to?: string }> }) {
  const sp = await searchParams;
  const ctx = await requireCtx();
  const today = new Date().toISOString().slice(0, 10);
  const from = sp.from || today, to = sp.to || today;
  const r = await dailyCollections(ctx, new Date(from + "T00:00:00"), new Date(to + "T23:59:59"));
  return (
    <>
      <PageHeader title="التحصيلات" sub="صافي المحصَّل = الدفعات − المرتجعات (نقدي فعلي، وليس إيرادًا مستحقًا)" />
      <Card className="mb-4">
        <form className="flex flex-wrap items-end gap-2">
          <label className="text-xs font-semibold">من<input type="date" name="from" defaultValue={from} className={`${input} mt-1`} /></label>
          <label className="text-xs font-semibold">إلى<input type="date" name="to" defaultValue={to} className={`${input} mt-1`} /></label>
          <button className={btn.primary}>عرض</button>
        </form>
      </Card>
      <div className="mb-4 grid grid-cols-2 gap-3 md:grid-cols-4">
        <Stat label="صافي المحصَّل" value={money(r.net)} tone="text-emerald-600" />
        {Object.entries(r.byMethod).map(([k, v]) => <Stat key={k} label={L.method[k as keyof typeof L.method]} value={money(v)} />)}
      </div>
      <Card>
        {r.rows.length === 0 ? <Empty title="لا توجد حركات تحصيل في هذه الفترة" /> : (
          <Table head={["الإيصال", "النوع", "العميل", "الأمر", "الطريقة", "المبلغ", "الوقت"]}>
            {r.rows.map((p) => (
              <tr key={p.id}><Td><a href={`/print/payment/${p.id}`} target="_blank" className="num font-semibold text-navy-700">{p.number}</a></Td><Td><Pill tone={p.kind === "REFUND" ? "red" : "green"}>{L.payKind[p.kind]}</Pill></Td><Td>{p.customer.name}</Td><Td><Num>{p.order.number}</Num></Td><Td>{L.method[p.method]}</Td><Td><span className={`num font-bold ${p.kind === "REFUND" ? "text-rose-600" : ""}`}>{p.kind === "REFUND" ? "−" : ""}{money(p.amount)}</span></Td><Td>{dt(p.createdAt)}</Td></tr>
            ))}
          </Table>
        )}
      </Card>
    </>
  );
}
