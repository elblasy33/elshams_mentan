import Link from "next/link";
import { notFound } from "next/navigation";
import { Printer } from "lucide-react";
import { requireCtx } from "@/server/session";
import { getOrder } from "@/server/services/orders";
import { prisma, Prisma } from "@/server/db";
import { listStaff } from "@/server/services/users";
import { TEST_TEMPLATES } from "@/server/services/quality";
import { Card, PageHeader, StatusBadge, Pill, btn } from "@/components/ui";
import { L } from "@/lib/labels";
import { dt, d, money } from "@/lib/format";
import { OrderPanels } from "./OrderPanels";
import { AppError } from "@/server/errors";

const ser = <T,>(v: T): T => JSON.parse(JSON.stringify(v, (_k, x) => (x instanceof Prisma.Decimal ? x.toString() : x)));

export default async function OrderPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const ctx = await requireCtx();
  let o;
  try { o = await getOrder(ctx, id); } catch (e) { if (e instanceof AppError && e.status === 404) notFound(); throw e; }
  const parts = ctx.perms.has("quote.write") || ctx.perms.has("stock.issue")
    ? await prisma.sparePart.findMany({ where: { active: true }, orderBy: { code: "asc" }, take: 500, select: { id: true, code: true, name: true, salePrice: true, onHand: true } }) : [];
  const staff = ctx.perms.has("order.assign") ? await listStaff(ctx) : [];
  const f = o.finance;
  const payTone = f.status === "PAID" ? "green" : f.status === "UNPAID" ? "red" : "amber";
  return (
    <>
      <PageHeader
        title={`أمر صيانة ${o.number}`}
        sub={`استلام ${dt(o.receivedAt)} بواسطة ${o.receivedBy.name}`}
        actions={<>
          <Link href={`/print/intake/${o.id}`} target="_blank" className={btn.ghost}><Printer size={16} />إيصال استلام</Link>
          <Link href={`/print/order/${o.id}`} target="_blank" className={btn.ghost}><Printer size={16} />أمر الصيانة</Link>
          {o.quotations.length > 0 && <Link href={`/print/quote/${o.id}`} target="_blank" className={btn.ghost}><Printer size={16} />عرض السعر</Link>}
          {o.status === "DELIVERED" && <Link href={`/print/delivery/${o.id}`} target="_blank" className={btn.ghost}><Printer size={16} />إيصال تسليم</Link>}
          {o.warranty && <Link href={`/print/warranty/${o.id}`} target="_blank" className={btn.ghost}><Printer size={16} />شهادة ضمان</Link>}
        </>}
      />
      <div className="mb-4 flex flex-wrap items-center gap-2">
        <StatusBadge status={o.status} />
        <Pill tone={payTone as "green"}>{L.payStatus[f.status]}</Pill>
        <Pill>{L.mode[o.executionMode]}</Pill>
        <Pill>{L.channel[o.intakeChannel]}</Pill>
        {o.priority !== "NORMAL" && <Pill tone="red">{L.priority[o.priority]}</Pill>}
        {o.warrantyOf && <Link href={`/orders/${o.warrantyOf.id}`}><Pill tone="blue">عودة ضمان للأمر {o.warrantyOf.number}</Pill></Link>}
        {o.warrantyDecision && <Pill tone={o.warrantyDecision === "ACCEPTED" ? "green" : "red"}>الضمان: {o.warrantyDecision === "ACCEPTED" ? (o.warrantyCovered ? "مقبول — مجاني" : "مقبول — بتكلفة") : "مرفوض"}</Pill>}
      </div>

      <div className="grid gap-4 lg:grid-cols-3">
        <Card title="العميل">
          <Link href={`/customers/${o.customer.id}`} className="font-bold text-navy-700">{o.customer.name}</Link>
          <div className="num mt-1 text-sm text-slate-600">{o.customer.phone}</div>
          {o.customer.address && <div className="mt-1 text-sm text-slate-500">{o.customer.address}</div>}
        </Card>
        <Card title="الجهاز">
          <div className="font-bold">{o.device.type.nameAr} {o.device.brand} {o.device.model}</div>
          <div className="mt-1 text-sm text-slate-500">{o.device.serial && <>سيريال: <span className="num">{o.device.serial}</span> · </>}{o.device.size} {o.device.color}</div>
          {o.accessories && <div className="mt-1 text-sm">الملحقات: {o.accessories}</div>}
          {o.intakeCondition && <div className="text-sm">الحالة عند الاستلام: {o.intakeCondition}</div>}
        </Card>
        <Card title="الحساب">
          <dl className="space-y-1 text-sm">
            <div className="flex justify-between"><dt className="text-slate-500">المستحق المعتمد</dt><dd className="font-bold">{money(f.due)}</dd></div>
            <div className="flex justify-between"><dt className="text-slate-500">صافي المحصل</dt><dd>{money(f.net)}</dd></div>
            <div className="flex justify-between border-t border-line pt-1"><dt className="text-slate-500">{f.balance.lt(0) ? "رصيد دائن للعميل" : "المتبقي"}</dt><dd className={`font-extrabold ${f.balance.gt(0) ? "text-rose-600" : "text-emerald-600"}`}>{money(f.balance.abs())}</dd></div>
          </dl>
          <div className="mt-2 text-xs text-slate-400">الموعد المتوقع: {d(o.expectedAt)} · الفني: {o.technician?.name ?? "—"}</div>
        </Card>
        <Card title="شكوى العميل" className="lg:col-span-3"><p className="whitespace-pre-wrap text-sm">{o.complaint}</p></Card>
      </div>

      <OrderPanels
        order={ser({ id: o.id, status: o.status, diagnosis: o.diagnosis, repairNotes: o.repairNotes, internalNotes: o.internalNotes, technicianId: o.technicianId, expectedAt: o.expectedAt, deviceTypeCode: o.device.type.code, warrantyCovered: o.warrantyCovered, deliveredTo: o.deliveredTo, deliveryOverride: o.deliveryOverride, deliveredAt: o.deliveredAt })}
        finance={ser({ due: f.due, net: f.net, balance: f.balance, status: f.status })}
        quotations={ser(o.quotations)} payments={ser(o.payments)} parts={ser(o.parts)} tests={ser(o.tests)} history={ser(o.history)}
        warranty={ser(o.warranty)} userName={o.userName} catalog={ser(parts)} staff={staff}
        template={TEST_TEMPLATES[o.device.type.code] ?? TEST_TEMPLATES.OTHER}
        perms={[...ctx.perms]}
      />
    </>
  );
}
