import Link from "next/link";
import { UserPlus } from "lucide-react";
import { requireCtx } from "@/server/session";
import { listCustomers } from "@/server/services/customers";
import { Card, PageHeader, Empty, btn, input, Table, Td, Pager, Pill, Num } from "@/components/ui";
import { L } from "@/lib/labels";

export default async function Customers({ searchParams }: { searchParams: Promise<{ search?: string; page?: string; archived?: string }> }) {
  const sp = await searchParams;
  const ctx = await requireCtx();
  const r = await listCustomers(ctx, { search: sp.search, page: Number(sp.page) || 1, archived: sp.archived === "1" });
  return (
    <>
      <PageHeader title="العملاء" sub={`${r.total} عميل`} actions={ctx.perms.has("customer.write") && <Link href="/customers/new" className={btn.sun}><UserPlus size={16} />عميل جديد</Link>} />
      <Card>
        <form className="mb-4 flex gap-2">
          <input name="search" defaultValue={sp.search} placeholder="الاسم / الموبايل / الكود" className={`${input} max-w-sm`} />
          <label className="flex items-center gap-2 text-sm"><input type="checkbox" name="archived" value="1" defaultChecked={sp.archived === "1"} />المؤرشفون</label>
          <button className={btn.primary}>بحث</button>
        </form>
        {r.items.length === 0 ? <Empty title="لا يوجد عملاء" hint="سجّل أول عميل للبدء." /> : (
          <Table head={["الكود", "الاسم", "النوع", "الموبايل", "عدد الأوامر"]}>
            {r.items.map((c) => (
              <tr key={c.id} className="hover:bg-slate-50">
                <Td><Num>{c.code}</Num></Td>
                <Td><Link href={`/customers/${c.id}`} className="font-bold text-navy-700">{c.name}</Link></Td>
                <Td><Pill>{L.customerType[c.type]}</Pill></Td>
                <Td><Num>{c.phone}</Num></Td>
                <Td><Num>{c._count.orders}</Num></Td>
              </tr>
            ))}
          </Table>
        )}
        <Pager page={r.page} pages={r.pages} base={`/customers?search=${sp.search ?? ""}`} />
      </Card>
    </>
  );
}
