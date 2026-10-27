import { requireCtx } from "@/server/session";
import { listMovements } from "@/server/services/inventory";
import { Card, PageHeader, Empty, Table, Td, Pager, Pill, Num } from "@/components/ui";
import { L } from "@/lib/labels";
import { dt, money, qty } from "@/lib/format";

export default async function Movements({ searchParams }: { searchParams: Promise<{ page?: string }> }) {
  const sp = await searchParams;
  const ctx = await requireCtx();
  const r = await listMovements(ctx, { page: Number(sp.page) || 1 });
  const users = await (await import("@/server/db")).prisma.user.findMany({ select: { id: true, name: true } });
  const un = Object.fromEntries(users.map((u) => [u.id, u.name]));
  return (
    <>
      <PageHeader title="حركات المخزون" sub="سجل غير قابل للتعديل لكل تغيير في الأرصدة" />
      <Card>
        {r.items.length === 0 ? <Empty title="لا توجد حركات" /> : (
          <Table head={["التاريخ", "النوع", "القطعة", "الكمية", "التكلفة", "الرصيد بعد", "الأمر", "المستخدم", "السبب"]}>
            {r.items.map((m) => (
              <tr key={m.id}><Td className="whitespace-nowrap">{dt(m.createdAt)}</Td><Td><Pill tone={Number(m.qtyDelta) < 0 ? "amber" : "green"}>{L.move[m.type]}</Pill></Td><Td>{m.part.code} · {m.part.name}</Td><Td><span className="num font-bold">{Number(m.qtyDelta) > 0 ? "+" : ""}{qty(m.qtyDelta)}</span></Td><Td><Num>{money(m.unitCost)}</Num></Td><Td><Num>{qty(m.balanceAfter)}</Num></Td><Td>{m.order?.number && <Num>{m.order.number}</Num>}</Td><Td>{un[m.userId]}</Td><Td className="text-slate-500">{m.reason ?? m.reference}</Td></tr>
            ))}
          </Table>
        )}
        <Pager page={r.page} pages={r.pages} base="/inventory/movements" />
      </Card>
    </>
  );
}
