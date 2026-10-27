import { notFound, redirect } from "next/navigation";
import QRCode from "qrcode";
import { headers } from "next/headers";
import { getCtx } from "@/server/session";
import { prisma } from "@/server/db";
import { getOrder } from "@/server/services/orders";
import { getPayment } from "@/server/services/payments";
import { getSettings } from "@/server/settings";
import { AppError } from "@/server/errors";
import { L, STATUS_LABEL } from "@/lib/labels";
import { dt, d, money, qty } from "@/lib/format";
import { PrintButton } from "../PrintButton";

const TITLES: Record<string, string> = { intake: "إيصال استلام جهاز", order: "أمر صيانة", payment: "إيصال", delivery: "إيصال تسليم", warranty: "شهادة ضمان", quote: "عرض سعر" };

export default async function Print({ params, searchParams }: { params: Promise<{ kind: string; id: string }>; searchParams: Promise<{ w?: string }> }) {
  const { kind, id } = await params;
  const thermal = (await searchParams).w === "thermal";
  const ctx = await getCtx();
  if (!ctx) redirect("/login");
  if (!TITLES[kind]) notFound();
  const s = await getSettings();

  let orderId = id;
  let payment: Awaited<ReturnType<typeof getPayment>> | null = null;
  if (kind === "payment") {
    try { payment = await getPayment(ctx, id); } catch (e) { if (e instanceof AppError) notFound(); throw e; }
    orderId = payment.orderId;
  }
  let o;
  try { o = await getOrder(ctx, orderId); } catch (e) { if (e instanceof AppError) notFound(); throw e; }
  const h = await headers();
  const origin = `${h.get("x-forwarded-proto") ?? "http"}://${h.get("host")}`;
  const qr = await QRCode.toString(`${origin}/orders/${o.id}`, { type: "svg", margin: 0, width: 90 });
  const q = o.quotations.find((x) => x.status === "APPROVED") ?? o.quotations[0];
  const isReceipt = kind === "payment";
  const title = isReceipt && payment ? (payment.kind === "DEPOSIT" ? "إيصال عربون" : payment.kind === "REFUND" ? "إيصال رد مبلغ" : "إيصال تحصيل") : TITLES[kind];
  const number = isReceipt && payment ? payment.number : kind === "warranty" ? o.warranty?.number : o.number;
  if (kind === "warranty" && !o.warranty) notFound();
  if (kind === "delivery" && o.status !== "DELIVERED") notFound();

  return (
    <div data-theme="light" className="min-h-screen bg-slate-100 pb-8 text-[#1b2236] print:bg-white print:pb-0">
      <PrintButton thermal={thermal} href={`/print/${kind}/${id}`} />
      <div className={thermal ? "print-thermal" : "print-sheet shadow"} dir="rtl">
        <header className="flex items-start justify-between border-b-2 border-navy-900 pb-3">
          <div>
            <h1 className="text-xl font-extrabold text-navy-900">{s.companyName}</h1>
            <p className="text-xs text-slate-600">{s.companyAddress} {s.companyPhone && <>· <span className="num">{s.companyPhone}</span></>}</p>
          </div>
          <div className="text-start" dangerouslySetInnerHTML={{ __html: qr }} />
        </header>
        <div className="my-3 flex items-baseline justify-between">
          <h2 className="text-lg font-bold">{title}</h2>
          <div className="text-sm">رقم: <b className="num">{number}</b> · <span className="num">{dt(new Date())}</span></div>
        </div>

        <table className="mb-3 w-full text-sm">
          <tbody>
            <tr><td className="w-28 py-0.5 text-slate-500">العميل</td><td className="font-semibold">{o.customer.name} — <span className="num">{o.customer.phone}</span></td></tr>
            <tr><td className="py-0.5 text-slate-500">الجهاز</td><td>{o.device.type.nameAr} {o.device.brand} {o.device.model} {o.device.serial && <>· سيريال <span className="num">{o.device.serial}</span></>}</td></tr>
            <tr><td className="py-0.5 text-slate-500">أمر الصيانة</td><td><span className="num">{o.number}</span> · {STATUS_LABEL[o.status]}</td></tr>
          </tbody>
        </table>

        {(kind === "intake" || kind === "order") && (
          <>
            <Row k="الشكوى" v={o.complaint} />
            <Row k="الحالة عند الاستلام" v={o.intakeCondition} />
            <Row k="الملحقات" v={o.accessories} />
            <Row k="تاريخ الاستلام" v={dt(o.receivedAt)} />
            <Row k="الموعد المتوقع" v={d(o.expectedAt)} />
            <Row k="الموظف المستلم" v={o.receivedBy.name} />
            {kind === "order" && <><Row k="التشخيص" v={o.diagnosis} /><Row k="الإصلاح المنفذ" v={o.repairNotes} /></>}
            {o.payments.some((x) => x.kind === "DEPOSIT") && <Row k="العربون المدفوع" v={money(o.payments.filter((x) => x.kind === "DEPOSIT").reduce((a, x) => a + Number(x.amount), 0))} />}
            <p className="mt-4 text-xs leading-6 text-slate-600">{s.deliveryTerms}</p>
          </>
        )}

        {kind === "quote" && q && (
          <>
            <table className="w-full text-sm">
              <thead><tr className="border-b text-slate-500"><th className="py-1 text-start">البند</th><th>الكمية</th><th>السعر</th><th>الإجمالي</th></tr></thead>
              <tbody>{q.lines.map((l) => <tr key={l.id} className="border-b"><td className="py-1">{l.description}</td><td className="num text-center">{qty(l.qty)}</td><td className="num text-center">{money(l.unitPrice)}</td><td className="num text-center">{money(Number(l.qty) * Number(l.unitPrice))}</td></tr>)}</tbody>
            </table>
            <div className="mt-2 space-y-0.5 text-end text-sm">
              {Number(q.discount) > 0 && <div>الخصم: <b className="num">{money(q.discount)}</b></div>}
              {Number(q.taxAmount) > 0 && <div>الضريبة: <b className="num">{money(q.taxAmount)}</b></div>}
              <div className="text-base">الإجمالي: <b className="num">{money(q.total)}</b></div>
              <div className="text-xs text-slate-500">صالح حتى {d(q.validUntil)}</div>
            </div>
          </>
        )}

        {isReceipt && payment && (
          <>
            <Row k="المبلغ" v={<b className="num text-lg">{money(payment.amount)}</b>} />
            <Row k="طريقة الدفع" v={L.method[payment.method]} />
            <Row k="النوع" v={L.payKind[payment.kind]} />
            {payment.reason && <Row k="السبب" v={payment.reason} />}
            <Row k="المستلم" v={payment.userName} />
            <Row k="المتبقي على الأمر" v={money(o.finance.balance.gt(0) ? o.finance.balance : 0)} />
          </>
        )}

        {kind === "delivery" && (
          <>
            <Row k="تاريخ التسليم" v={dt(o.deliveredAt)} />
            <Row k="المستلم" v={o.deliveredTo} />
            <Row k="الإجمالي المعتمد" v={money(o.finance.due)} />
            <Row k="المدفوع" v={money(o.finance.net)} />
            {o.deliveryOverride && <Row k="استثناء تسليم" v={o.deliveryOverride} />}
            {o.warranty && <Row k="الضمان" v={`${o.warranty.months} شهر حتى ${d(o.warranty.endsAt)}`} />}
            <p className="mt-4 text-xs text-slate-600">أقر بأنني استلمت الجهاز بحالة سليمة وفق ما هو مسجل.</p>
          </>
        )}

        {kind === "warranty" && o.warranty && (
          <>
            <Row k="بداية الضمان" v={d(o.warranty.startsAt)} />
            <Row k="نهاية الضمان" v={d(o.warranty.endsAt)} />
            <Row k="التغطية" v={o.warranty.coverage} />
            <Row k="الاستثناءات" v={o.warranty.exclusions} />
          </>
        )}

        <div className="mt-10 grid grid-cols-2 gap-8 text-center text-xs text-slate-500">
          <div className="border-t pt-1">توقيع الموظف</div><div className="border-t pt-1">توقيع العميل</div>
        </div>
      </div>
    </div>
  );
}

function Row({ k, v }: { k: string; v: React.ReactNode }) {
  if (!v) return null;
  return <div className="flex gap-3 border-b border-dashed py-1.5 text-sm"><span className="w-36 shrink-0 text-slate-500">{k}</span><span className="whitespace-pre-wrap">{v}</span></div>;
}
