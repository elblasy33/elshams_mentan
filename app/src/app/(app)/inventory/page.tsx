import Link from "next/link";
import { requireCtx } from "@/server/session";
import { listParts } from "@/server/services/inventory";
import { Card, PageHeader, Empty, btn, input, Table, Td, Pager, Pill, Num } from "@/components/ui";
import { money, qty } from "@/lib/format";
import { PartForms } from "./PartForms";
import { Prisma } from "@/server/db";

export default async function Inventory({ searchParams }: { searchParams: Promise<{ search?: string; low?: string; page?: string }> }) {
  const sp = await searchParams;
  const ctx = await requireCtx();
  const r = await listParts(ctx, { search: sp.search, low: sp.low === "1", page: Number(sp.page) || 1 });
  const ser = JSON.parse(JSON.stringify(r.items, (_k, x) => (x instanceof Prisma.Decimal ? x.toString() : x)));
  return (
    <>
      <PageHeader title="المخزون وقطع الغيار" sub={`${r.total} قطعة`} actions={<Link href="/inventory/movements" className={btn.ghost}>حركات المخزون</Link>} />
      {ctx.perms.has("stock.manage") && <PartForms parts={ser.map((p: any) => ({ id: p.id, code: p.code, name: p.name }))} canPrice={ctx.perms.has("part.price")} canAdjust={ctx.perms.has("stock.adjust")} />}
      <Card className="mt-4">
        <form className="mb-4 flex flex-wrap gap-2">
          <input name="search" defaultValue={sp.search} placeholder="الكود أو الاسم" className={`${input} max-w-sm`} />
          <label className="flex items-center gap-2 text-sm"><input type="checkbox" name="low" value="1" defaultChecked={sp.low === "1"} />المنخفضة فقط</label>
          <button className={btn.primary}>بحث</button>
        </form>
        {r.items.length === 0 ? <Empty title="لا توجد قطع غيار" hint="عرّف قطعة جديدة ثم سجّل استلامها من المورد." /> : (
          <Table head={["الكود", "الاسم", "الرصيد", "حد الطلب", "متوسط التكلفة", "سعر البيع", "الموقع"]}>
            {r.items.map((p) => {
              const low = p.onHand.lte(p.reorderLevel);
              return (
                <tr key={p.id}><Td><Num>{p.code}</Num></Td><Td>{p.name}</Td><Td><span className={`num font-bold ${low ? "text-rose-600" : ""}`}>{qty(p.onHand)}</span> {low && <Pill tone="red">منخفض</Pill>}</Td><Td><Num>{qty(p.reorderLevel)}</Num></Td><Td><Num>{money(p.avgCost)}</Num></Td><Td><Num>{money(p.salePrice)}</Num></Td><Td>{p.location}</Td></tr>
              );
            })}
          </Table>
        )}
        <Pager page={r.page} pages={r.pages} base={`/inventory?search=${sp.search ?? ""}`} />
      </Card>
    </>
  );
}
