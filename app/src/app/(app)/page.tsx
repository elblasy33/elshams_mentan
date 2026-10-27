import Link from "next/link";
import { Plus, UserPlus, Wallet, AlertTriangle } from "lucide-react";
import { requireCtx } from "@/server/session";
import { dashboard } from "@/server/services/dashboard";
import { Card, PageHeader, Stat, Empty, StatusBadge, btn, Table, Td, Num } from "@/components/ui";
import { StatusChart, WorkloadChart, TypeChart } from "./Charts";
import { STATUS_LABEL } from "@/lib/labels";
import { money, d } from "@/lib/format";

export default async function Dashboard() {
  const ctx = await requireCtx();
  const s = await dashboard(ctx);
  const c = (k: string) => s.counts[k as keyof typeof s.counts] ?? 0;
  const total = Object.values(s.counts).reduce((a, b) => a + (b ?? 0), 0);
  const statusData = Object.entries(s.counts).map(([k, v]) => ({ name: STATUS_LABEL[k], value: v as number }));
  const can = (p: string) => ctx.perms.has(p);
  return (
    <>
      <PageHeader title="لوحة التحكم" sub="نظرة مباشرة على التشغيل اليوم"
        actions={<>
          {can("order.create") && <Link href="/orders/new" className={btn.sun}><Plus size={16} />أمر صيانة جديد</Link>}
          {can("customer.write") && <Link href="/customers/new" className={btn.ghost}><UserPlus size={16} />عميل جديد</Link>}
          {can("payment.read") && <Link href="/payments" className={btn.ghost}><Wallet size={16} />التحصيلات</Link>}
        </>} />
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <Stat label="مستلم اليوم" value={<Num>{s.receivedToday}</Num>} />
        <Stat label="في انتظار الفحص" value={<Num>{c("RECEIVED") + c("AWAITING_INSPECTION")}</Num>} href="/orders?status=AWAITING_INSPECTION" />
        <Stat label="في انتظار موافقة العميل" value={<Num>{c("AWAITING_APPROVAL")}</Num>} href="/orders?status=AWAITING_APPROVAL" />
        <Stat label="جاري الإصلاح" value={<Num>{c("REPAIRING") + c("READY_TO_REPAIR") + c("REWORK")}</Num>} href="/orders?status=REPAIRING" />
        <Stat label="في انتظار قطع غيار" value={<Num>{c("AWAITING_PARTS")}</Num>} href="/orders?status=AWAITING_PARTS" />
        <Stat label="في انتظار الاختبار" value={<Num>{c("AWAITING_TEST")}</Num>} href="/orders?status=AWAITING_TEST" />
        <Stat label="جاهز للتسليم" value={<Num>{c("READY_FOR_DELIVERY")}</Num>} tone="text-emerald-600" href="/orders?status=READY_FOR_DELIVERY" />
        <Stat label="متأخر" value={<Num>{s.overdue.length}</Num>} tone={s.overdue.length ? "text-rose-600" : undefined} href="/orders?overdue=1" />
        {s.collectedToday !== null && <Stat label="المحصَّل اليوم (صافي)" value={money(s.collectedToday)} />}
        {s.outstanding !== null && <Stat label="مستحقات غير محصلة" value={money(s.outstanding)} tone="text-amber-600" />}
      </div>

      {total === 0 ? (
        <Card className="mt-6"><Empty title="لا توجد أوامر صيانة بعد" hint="ابدأ بتسجيل عميل ثم افتح أول أمر صيانة لاستلام جهاز." action={can("order.create") ? <Link href="/orders/new" className={btn.sun}>أمر صيانة جديد</Link> : undefined} /></Card>
      ) : (
        <div className="mt-6 grid gap-4 lg:grid-cols-3">
          <Card title="الأوامر حسب الحالة" className="lg:col-span-2"><StatusChart data={statusData} /></Card>
          <Card title="حسب نوع الجهاز"><TypeChart data={s.byType} /></Card>
          <Card title="حجم العمل — آخر 14 يومًا" className="lg:col-span-3"><WorkloadChart data={s.series} /></Card>
        </div>
      )}

      <div className="mt-6 grid gap-4 lg:grid-cols-2">
        <Card title="أحدث الأوامر">
          {s.recent.length === 0 ? <Empty title="لا توجد أوامر" /> : (
            <Table head={["الأمر", "العميل", "الجهاز", "الحالة"]}>
              {s.recent.map((o) => (
                <tr key={o.id}><Td><Link className="font-semibold text-navy-700" href={`/orders/${o.id}`}><Num>{o.number}</Num></Link></Td><Td>{o.customer.name}</Td><Td>{o.device.type.nameAr}</Td><Td><StatusBadge status={o.status} /></Td></tr>
              ))}
            </Table>
          )}
        </Card>
        <Card title={<span className="flex items-center gap-2">الأجهزة المتأخرة {s.overdue.length > 0 && <AlertTriangle size={16} className="text-rose-500" />}</span>}>
          {s.overdue.length === 0 ? <Empty title="لا توجد أجهزة متأخرة" /> : (
            <Table head={["الأمر", "العميل", "الموعد", "الحالة"]}>
              {s.overdue.map((o) => (
                <tr key={o.id}><Td><Link className="font-semibold text-navy-700" href={`/orders/${o.id}`}><Num>{o.number}</Num></Link></Td><Td>{o.customer.name}</Td><Td className="text-rose-600">{d(o.expectedAt)}</Td><Td><StatusBadge status={o.status} /></Td></tr>
              ))}
            </Table>
          )}
        </Card>
        {s.lowStock.length > 0 && (
          <Card title="تنبيهات انخفاض المخزون" className="lg:col-span-2">
            <Table head={["الكود", "القطعة", "الرصيد", "حد إعادة الطلب"]}>
              {s.lowStock.map((p) => <tr key={p.id}><Td><Num>{p.code}</Num></Td><Td>{p.name}</Td><Td className="font-bold text-rose-600"><Num>{Number(p.onHand)}</Num></Td><Td><Num>{Number(p.reorderLevel)}</Num></Td></tr>)}
            </Table>
          </Card>
        )}
      </div>
    </>
  );
}
