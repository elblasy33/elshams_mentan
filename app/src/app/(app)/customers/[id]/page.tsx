import Link from "next/link";
import { notFound } from "next/navigation";
import { requireCtx } from "@/server/session";
import { getCustomer } from "@/server/services/customers";
import { AppError } from "@/server/errors";
import { Card, PageHeader, Stat, StatusBadge, Table, Td, btn, Pill, Empty, Num } from "@/components/ui";
import { L } from "@/lib/labels";
import { d, money } from "@/lib/format";

export default async function CustomerPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const ctx = await requireCtx();
  let c;
  try { c = await getCustomer(ctx, id); } catch (e) { if (e instanceof AppError && e.status === 404) notFound(); throw e; }
  return (
    <>
      <PageHeader title={c.name} sub={`${c.code} · ${L.customerType[c.type]}${c.archivedAt ? " · مؤرشف" : ""}`}
        actions={ctx.perms.has("order.create") && !c.archivedAt && <Link href={`/orders/new`} className={btn.sun}>أمر صيانة جديد</Link>} />
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <Stat label="الموبايل" value={<Num>{c.phone}</Num>} />
        <Stat label="عدد الأوامر" value={<Num>{c.complaints}</Num>} />
        <Stat label="مبالغ مستحقة" value={money(c.outstanding)} tone={c.outstanding.gt(0) ? "text-rose-600" : undefined} />
        <Stat label="إجمالي الإنفاق (أوامر مسلّمة)" value={money(c.spend)} />
      </div>
      <div className="mt-4 grid gap-4 lg:grid-cols-2">
        <Card title="بيانات التواصل">
          <dl className="space-y-1 text-sm">
            {c.phone2 && <div>رقم بديل: <Num>{c.phone2}</Num></div>}
            {c.email && <div>البريد: {c.email}</div>}
            {c.address && <div>العنوان: {c.address}</div>}
            {c.taxNo && <div>الرقم الضريبي: {c.taxNo}</div>}
            {c.notes && <div className="text-slate-500">{c.notes}</div>}
          </dl>
        </Card>
        <Card title="الضمانات السارية">
          {c.warranties.length === 0 ? <Empty title="لا توجد ضمانات سارية" /> : c.warranties.map((w) => <div key={w.id} className="text-sm">{w.device.type.nameAr} {w.device.brand} — حتى {d(w.endsAt)} <Pill tone="green">ساري</Pill></div>)}
        </Card>
        <Card title="الأجهزة المسجلة" className="lg:col-span-2">
          {c.devices.length === 0 ? <Empty title="لا توجد أجهزة" /> : (
            <Table head={["النوع", "الماركة", "الموديل", "السيريال"]}>{c.devices.map((v) => <tr key={v.id}><Td>{v.type.nameAr}</Td><Td>{v.brand}</Td><Td>{v.model}</Td><Td><Num>{v.serial ?? "—"}</Num></Td></tr>)}</Table>
          )}
        </Card>
        <Card title="سجل التعاملات" className="lg:col-span-2">
          {c.orders.length === 0 ? <Empty title="لا توجد أوامر" /> : (
            <Table head={["الأمر", "الجهاز", "الاستلام", "الحالة"]}>{c.orders.map((o) => <tr key={o.id}><Td><Link className="font-semibold text-navy-700" href={`/orders/${o.id}`}><Num>{o.number}</Num></Link></Td><Td>{o.device.type.nameAr} {o.device.brand}</Td><Td>{d(o.receivedAt)}</Td><Td><StatusBadge status={o.status} /></Td></tr>)}</Table>
          )}
        </Card>
      </div>
    </>
  );
}
