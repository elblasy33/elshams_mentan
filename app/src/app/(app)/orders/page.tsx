import Link from "next/link";
import { Plus } from "lucide-react";
import { requireCtx } from "@/server/session";
import { listOrders } from "@/server/services/orders";
import { Card, PageHeader, Empty, StatusBadge, btn, input, Table, Td, Pager, Num } from "@/components/ui";
import { STATUS_LABEL } from "@/lib/labels";
import { d } from "@/lib/format";

type SP = Promise<{ search?: string; status?: string; page?: string; overdue?: string; customerId?: string }>;

export default async function Orders({ searchParams }: { searchParams: SP }) {
  const sp = await searchParams;
  const ctx = await requireCtx();
  const r = await listOrders(ctx, { search: sp.search, status: sp.status, overdue: sp.overdue === "1", customerId: sp.customerId, page: Number(sp.page) || 1 });
  const base = "/orders?" + new URLSearchParams(Object.entries(sp).filter(([k, v]) => v && k !== "page") as [string, string][]).toString();
  return (
    <>
      <PageHeader title="أوامر الصيانة" sub={`${r.total} أمر`} actions={ctx.perms.has("order.create") && <Link href="/orders/new" className={btn.sun}><Plus size={16} />أمر جديد</Link>} />
      <Card>
        <form className="mb-4 flex flex-wrap gap-2">
          <input name="search" defaultValue={sp.search} placeholder="رقم الأمر / العميل / الموبايل / السيريال" className={`${input} max-w-sm`} />
          <select name="status" defaultValue={sp.status ?? ""} className={`${input} max-w-[220px]`}>
            <option value="">كل الحالات</option>
            {Object.entries(STATUS_LABEL).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
          </select>
          <label className="flex items-center gap-2 text-sm"><input type="checkbox" name="overdue" value="1" defaultChecked={sp.overdue === "1"} />المتأخرة فقط</label>
          <button className={btn.primary}>بحث</button>
          <Link href="/orders" className={btn.ghost}>مسح</Link>
        </form>
        {r.items.length === 0 ? <Empty title="لا توجد أوامر مطابقة" hint="غيّر معايير البحث أو أنشئ أمرًا جديدًا." /> : (
          <Table head={["رقم الأمر", "العميل", "الجهاز", "الفني", "الاستلام", "الموعد", "الحالة"]}>
            {r.items.map((o) => (
              <tr key={o.id} className="hover:bg-slate-50">
                <Td><Link href={`/orders/${o.id}`} className="font-bold text-navy-700"><Num>{o.number}</Num></Link></Td>
                <Td>{o.customer.name}<div className="text-xs text-slate-400"><Num>{o.customer.phone}</Num></div></Td>
                <Td>{o.device.type.nameAr} {o.device.brand}</Td>
                <Td>{o.technician?.name ?? <span className="text-slate-400">غير مسند</span>}</Td>
                <Td>{d(o.receivedAt)}</Td>
                <Td className={o.expectedAt && o.expectedAt < new Date() && !["DELIVERED", "CANCELLED"].includes(o.status) ? "text-rose-600" : ""}>{d(o.expectedAt)}</Td>
                <Td><StatusBadge status={o.status} /></Td>
              </tr>
            ))}
          </Table>
        )}
        <Pager page={r.page} pages={r.pages} base={base} />
      </Card>
    </>
  );
}
