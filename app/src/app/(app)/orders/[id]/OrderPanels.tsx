"use client";
import { useState } from "react";
import { CheckCircle2, Circle, Plus, Trash2 } from "lucide-react";
import { useAction } from "@/components/useAction";
import { Card, Field, input, btn, Table, Td, Pill, Empty, StatusBadge } from "@/components/ui";
import { L, NEXT_ACTIONS } from "@/lib/labels";
import { dt, money, qty } from "@/lib/format";

/* eslint-disable @typescript-eslint/no-explicit-any */
type P = {
  order: any; finance: any; quotations: any[]; payments: any[]; parts: any[]; tests: any[]; history: any[]; warranty: any;
  userName: Record<string, string>; catalog: any[]; staff: { id: string; name: string }[]; template: string[]; perms: string[];
};

export function OrderPanels(p: P) {
  const has = (x: string) => p.perms.includes(x);
  const o = p.order;
  return (
    <div className="mt-4 space-y-4">
      <Actions {...p} has={has} />
      {(has("order.diagnose") || o.diagnosis || o.repairNotes) && <Technical {...p} has={has} />}
      <Quotations {...p} has={has} />
      <PartsPanel {...p} has={has} />
      <TestsPanel {...p} has={has} />
      <PaymentsPanel {...p} has={has} />
      {o.status === "READY_FOR_DELIVERY" && has("delivery.perform") && <Delivery {...p} has={has} />}
      {p.warranty && (
        <Card title="الضمان">
          <div className="grid gap-2 text-sm md:grid-cols-4">
            <div><span className="text-slate-500">رقم الضمان:</span> <span className="num font-bold">{p.warranty.number}</span></div>
            <div><span className="text-slate-500">من:</span> {dt(p.warranty.startsAt)}</div>
            <div><span className="text-slate-500">إلى:</span> {dt(p.warranty.endsAt)}</div>
            <div><span className="text-slate-500">المدة:</span> <span className="num">{p.warranty.months}</span> شهر</div>
            <div className="md:col-span-4"><span className="text-slate-500">التغطية:</span> {p.warranty.coverage}</div>
            <div className="md:col-span-4"><span className="text-slate-500">الاستثناءات:</span> {p.warranty.exclusions}</div>
          </div>
        </Card>
      )}
      <Timeline history={p.history} userName={p.userName} />
    </div>
  );
}

function Actions({ order, has, staff }: P & { has: (x: string) => boolean }) {
  const { run, pending, Msg } = useAction();
  const [note, setNote] = useState("");
  const acts = (NEXT_ACTIONS[order.status] ?? []).filter((a) => has("order.transition") && (a.to !== "CANCELLED" || has("order.cancel")));
  const terminal = ["DELIVERED", "CANCELLED"].includes(order.status);
  if (!acts.length && (terminal || !has("order.assign"))) return null;
  return (
    <Card title="الإجراءات">
      <div className="flex flex-wrap items-end gap-2">
        {acts.length > 0 && <input value={note} onChange={(e) => setNote(e.target.value)} placeholder="ملاحظة / سبب (إلزامي عند الإلغاء)" className={`${input} max-w-xs`} />}
        {acts.map((a) => (
          <button key={a.to} disabled={pending} className={a.danger ? btn.danger : btn.primary}
            onClick={() => run(`/orders/${order.id}/transition`, "POST", { to: a.to, note }, { confirm: a.danger ? "تأكيد الإلغاء؟" : undefined, onDone: () => setNote("") })}>{a.label}</button>
        ))}
        {has("order.assign") && !["DELIVERED", "CANCELLED"].includes(order.status) && (
          <select className={`${input} max-w-[200px]`} value={order.technicianId ?? ""} onChange={(e) => run(`/orders/${order.id}`, "PATCH", { technicianId: e.target.value || null })}>
            <option value="">— إسناد لفني —</option>
            {staff.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
          </select>
        )}
      </div>
      <div className="mt-3"><Msg /></div>
    </Card>
  );
}

function Technical({ order, has }: P & { has: (x: string) => boolean }) {
  const { run, pending, Msg } = useAction();
  const editable = has("order.diagnose") && !["DELIVERED", "CANCELLED"].includes(order.status);
  return (
    <Card title="التشخيص والإصلاح">
      <form className="grid gap-3 md:grid-cols-2" onSubmit={(e) => { e.preventDefault(); const f = new FormData(e.currentTarget); run(`/orders/${order.id}`, "PATCH", { diagnosis: f.get("diagnosis"), repairNotes: f.get("repairNotes") }); }}>
        <Field label="التشخيص الفني (ما وُجد)"><textarea name="diagnosis" rows={3} defaultValue={order.diagnosis ?? ""} disabled={!editable} className={input} /></Field>
        <Field label="الإصلاح المنفذ"><textarea name="repairNotes" rows={3} defaultValue={order.repairNotes ?? ""} disabled={!editable} className={input} /></Field>
        {editable && <div className="md:col-span-2 flex items-center gap-3"><button disabled={pending} className={btn.primary}>حفظ</button><Msg /></div>}
      </form>
    </Card>
  );
}

type Line = { type: string; description: string; partId: string; qty: string; unitPrice: string };

function Quotations({ order, quotations, has, catalog, finance }: P & { has: (x: string) => boolean }) {
  const { run, pending, Msg } = useAction();
  const [open, setOpen] = useState(false);
  const [lines, setLines] = useState<Line[]>([{ type: "INSPECTION", description: "رسوم فحص", partId: "", qty: "1", unitPrice: "" }]);
  const [discount, setDiscount] = useState("0");
  const [approving, setApproving] = useState<string | null>(null);
  const canEdit = has("quote.write") && ["INSPECTING", "AWAITING_QUOTE", "AWAITING_APPROVAL", "REPAIRING", "REWORK", "READY_TO_REPAIR", "AWAITING_PARTS"].includes(order.status);
  const set = (i: number, k: keyof Line, v: string) => setLines(lines.map((l, j) => (j === i ? { ...l, [k]: v } : l)));
  const subtotal = lines.reduce((s, l) => s + Number(l.qty || 0) * Number(l.unitPrice || (l.partId ? catalog.find((c) => c.id === l.partId)?.salePrice : 0) || 0), 0);

  return (
    <Card title="عروض الأسعار والموافقة" action={canEdit && <button className={btn.ghost} onClick={() => setOpen(!open)}><Plus size={14} />عرض جديد / تعديل</button>}>
      {open && (
        <form className="mb-5 space-y-3 rounded-xl bg-slate-50 p-4" onSubmit={async (e) => {
          e.preventDefault();
          const r = await run(`/orders/${order.id}/quotations`, "POST", { lines: lines.map((l) => ({ type: l.type, description: l.description, partId: l.partId || undefined, qty: Number(l.qty), unitPrice: l.unitPrice === "" ? undefined : Number(l.unitPrice) })), discount: Number(discount) }, { success: "تم إنشاء العرض (مسودة)" });
          if (r) setOpen(false);
        }}>
          {order.status === "REPAIRING" && <p className="text-sm text-amber-700">أي بند جديد يحتاج موافقة العميل قبل التنفيذ. حوّل الأمر أولًا إلى «في انتظار عرض السعر» ثم أرسل العرض المعدل.</p>}
          {lines.map((l, i) => (
            <div key={i} className="grid gap-2 md:grid-cols-[130px_1fr_180px_80px_110px_36px]">
              <select value={l.type} onChange={(e) => set(i, "type", e.target.value)} className={input}>{Object.entries(L.line).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select>
              <input value={l.description} onChange={(e) => set(i, "description", e.target.value)} placeholder="الوصف" required className={input} />
              <select value={l.partId} disabled={l.type !== "PART"} onChange={(e) => { const c = catalog.find((x) => x.id === e.target.value); setLines(lines.map((x, j) => j === i ? { ...x, partId: e.target.value, description: c ? c.name : x.description, unitPrice: "" } : x)); }} className={input}>
                <option value="">— قطعة —</option>{catalog.map((c) => <option key={c.id} value={c.id}>{c.code} · {c.name}</option>)}
              </select>
              <input type="number" step="0.001" min="0.001" value={l.qty} onChange={(e) => set(i, "qty", e.target.value)} className={`${input} num`} aria-label="الكمية" />
              <input type="number" step="0.01" min="0" value={l.unitPrice} onChange={(e) => set(i, "unitPrice", e.target.value)} placeholder={l.partId ? "سعر القطعة" : "السعر"} className={`${input} num`} aria-label="السعر" />
              <button type="button" className="text-rose-500" onClick={() => setLines(lines.filter((_, j) => j !== i))} aria-label="حذف"><Trash2 size={16} /></button>
            </div>
          ))}
          <div className="flex flex-wrap items-center gap-3">
            <button type="button" className={btn.ghost} onClick={() => setLines([...lines, { type: "LABOR", description: "", partId: "", qty: "1", unitPrice: "" }])}><Plus size={14} />بند</button>
            <label className="flex items-center gap-2 text-sm">خصم <input type="number" min="0" step="0.01" value={discount} onChange={(e) => setDiscount(e.target.value)} className={`${input} num w-28`} /></label>
            <span className="text-sm text-slate-500">الإجمالي التقريبي قبل الخصم/الضريبة: <b className="num">{money(subtotal)}</b></span>
            <button disabled={pending} className={btn.primary}>حفظ العرض</button>
          </div>
          <Msg />
        </form>
      )}
      {quotations.length === 0 ? <Empty title="لا توجد عروض أسعار" hint="يُنشأ العرض بعد التشخيص ثم يُرسل للعميل لأخذ موافقته." /> : (
        <div className="space-y-4">
          {quotations.map((q) => (
            <div key={q.id} className="rounded-xl border border-line p-4">
              <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
                <div className="flex items-center gap-2"><b>عرض رقم <span className="num">{q.version}</span></b><Pill tone={q.status === "APPROVED" ? "green" : q.status === "REJECTED" ? "red" : q.status === "SENT" ? "amber" : "slate"}>{L.quote[q.status as keyof typeof L.quote]}</Pill></div>
                <div className="flex gap-2">
                  {q.status === "DRAFT" && has("quote.write") && <button disabled={pending} className={btn.primary} onClick={() => run(`/quotations/${q.id}/send`, "POST", {})}>إرسال للعميل</button>}
                  {q.status === "SENT" && has("quote.approve") && <>
                    <button className={btn.sun} onClick={() => setApproving(q.id)}>تسجيل موافقة العميل</button>
                    <button disabled={pending} className={btn.danger} onClick={() => { const r = window.prompt("سبب الرفض (اختياري)"); if (r !== null) run(`/quotations/${q.id}/reject`, "POST", { reason: r }); }}>رفض العميل</button>
                  </>}
                </div>
              </div>
              <Table head={["النوع", "البند", "الكمية", "السعر", "الإجمالي"]}>
                {q.lines.map((l: any) => <tr key={l.id}><Td>{L.line[l.type as keyof typeof L.line]}</Td><Td>{l.description}{l.part && <span className="text-slate-400"> ({l.part.code})</span>}</Td><Td className="num">{qty(l.qty)}</Td><Td className="num">{money(l.unitPrice)}</Td><Td className="num">{money(Number(l.qty) * Number(l.unitPrice))}</Td></tr>)}
              </Table>
              <div className="mt-2 flex flex-wrap justify-end gap-4 text-sm">
                {Number(q.discount) > 0 && <span>خصم: <b className="num">{money(q.discount)}</b></span>}
                {Number(q.taxAmount) > 0 && <span>ضريبة: <b className="num">{money(q.taxAmount)}</b></span>}
                <span>الإجمالي: <b className="num text-lg">{money(q.total)}</b></span>
              </div>
              {q.status === "APPROVED" && <p className="mt-2 text-xs text-slate-500">موافقة العميل عبر {L.approval[q.approvalChannel as keyof typeof L.approval]} بتاريخ {dt(q.approvalContactAt)} — {q.approvalNote}</p>}
              {q.status === "REJECTED" && q.rejectionReason && <p className="mt-2 text-xs text-rose-600">سبب الرفض: {q.rejectionReason}</p>}
              {approving === q.id && (
                <form className="mt-3 grid gap-2 rounded-lg bg-amber-50 p-3 md:grid-cols-4" onSubmit={async (e) => { e.preventDefault(); const f = new FormData(e.currentTarget); const r = await run(`/quotations/${q.id}/approve`, "POST", { channel: f.get("channel"), contactAt: f.get("contactAt"), note: f.get("note") }, { success: "تم تسجيل الموافقة" }); if (r) setApproving(null); }}>
                  <Field label="طريقة التواصل"><select name="channel" className={input}>{Object.entries(L.approval).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select></Field>
                  <Field label="تاريخ التواصل"><input type="datetime-local" name="contactAt" required defaultValue={new Date(Date.now() - new Date().getTimezoneOffset() * 60000).toISOString().slice(0, 16)} className={input} /></Field>
                  <Field label="ملاحظة"><input name="note" className={input} /></Field>
                  <div className="flex items-end gap-2"><button disabled={pending} className={btn.primary}>تأكيد الموافقة</button><button type="button" className={btn.ghost} onClick={() => setApproving(null)}>إلغاء</button></div>
                </form>
              )}
            </div>
          ))}
        </div>
      )}
      <div className="mt-3"><Msg /></div>
      <p className="mt-2 text-xs text-slate-400">الإجمالي المعتمد الحالي: <span className="num">{money(finance.due)}</span></p>
    </Card>
  );
}

function PartsPanel({ order, parts, quotations, has, catalog }: P & { has: (x: string) => boolean }) {
  const { run, pending, Msg } = useAction();
  const approved = quotations.find((q) => q.status === "APPROVED");
  const approvedParts = (approved?.lines ?? []).filter((l: any) => l.partId);
  const canIssue = has("stock.issue") && ["READY_TO_REPAIR", "REPAIRING", "REWORK", "AWAITING_PARTS"].includes(order.status);
  if (!parts.length && !approvedParts.length) return null;
  return (
    <Card title="قطع الغيار">
      {parts.length > 0 && (
        <Table head={["القطعة", "مصروف", "مرتجع", "تالف", "الصافي", ""]}>
          {parts.map((x) => {
            const net = Number(x.qtyIssued) - Number(x.qtyReturned) - Number(x.qtyDamaged);
            return (
              <tr key={x.id}><Td>{x.part.code} · {x.part.name}</Td><Td className="num">{qty(x.qtyIssued)}</Td><Td className="num">{qty(x.qtyReturned)}</Td><Td className="num">{qty(x.qtyDamaged)}</Td><Td className="num font-bold">{net}</Td>
                <Td>{canIssue && net > 0 && <div className="flex gap-2">
                  <button className={btn.ghost} disabled={pending} onClick={() => { const n = window.prompt("كمية الإرجاع للمخزن", "1"); if (n) run("/stock/return", "POST", { orderId: order.id, partId: x.partId, qty: Number(n) }); }}>إرجاع</button>
                  <button className={btn.danger} disabled={pending} onClick={() => { const n = window.prompt("كمية التالف", "1"); const r = n && window.prompt("سبب التلف"); if (n && r) run("/stock/return", "POST", { orderId: order.id, partId: x.partId, qty: Number(n), damaged: true, reason: r }); }}>تالف</button></div>}</Td></tr>
            );
          })}
        </Table>
      )}
      {canIssue && approvedParts.length > 0 && (
        <form className="mt-3 flex flex-wrap items-end gap-2" onSubmit={(e) => { e.preventDefault(); const f = new FormData(e.currentTarget); run("/stock/issue", "POST", { orderId: order.id, partId: f.get("partId"), qty: Number(f.get("qty")) }, { success: "تم الصرف" }); }}>
          <Field label="صرف قطعة معتمدة"><select name="partId" className={input}>{approvedParts.map((l: any) => <option key={l.id} value={l.partId}>{l.description} — معتمد {qty(l.qty)} (متاح {qty(catalog.find((c) => c.id === l.partId)?.onHand)})</option>)}</select></Field>
          <Field label="الكمية"><input name="qty" type="number" step="0.001" min="0.001" defaultValue="1" className={`${input} num w-24`} /></Field>
          <button disabled={pending} className={btn.primary}>صرف</button>
        </form>
      )}
      <div className="mt-2"><Msg /></div>
    </Card>
  );
}

function TestsPanel({ order, tests, template, has }: P & { has: (x: string) => boolean }) {
  const { run, pending, Msg } = useAction();
  const [res, setRes] = useState<Record<string, string>>({});
  const canTest = has("qc.write") && order.status === "AWAITING_TEST";
  if (!tests.length && !canTest) return null;
  return (
    <Card title="الاختبار النهائي">
      {tests.map((t) => (
        <div key={t.id} className="mb-3 rounded-lg border border-line p-3 text-sm">
          <div className="flex items-center gap-2"><b>جولة <span className="num">{t.round}</span></b><Pill tone={t.result === "PASS" ? "green" : t.result === "FAIL" ? "red" : "amber"}>{L.test[t.result as keyof typeof L.test]}</Pill><span className="text-xs text-slate-400">{dt(t.createdAt)}</span></div>
          <ul className="mt-1 grid gap-x-6 sm:grid-cols-2">{t.items.map((i: any) => <li key={i.name}>{i.name}: <b>{L.test[i.result as keyof typeof L.test]}</b></li>)}</ul>
          {t.notes && <p className="mt-1 text-slate-500">{t.notes}</p>}
        </div>
      ))}
      {canTest && (
        <form key={tests.length} onSubmit={(e) => { e.preventDefault(); const f = new FormData(e.currentTarget); run(`/orders/${order.id}/tests`, "POST", { items: template.map((n) => ({ name: n, result: res[n] ?? "PASS" })), notes: f.get("notes") }, { success: "تم تسجيل نتيجة الاختبار", onDone: () => setRes({}) }); }} className="space-y-3">
          <div className="grid gap-2 sm:grid-cols-2">
            {template.map((n) => (
              <div key={n} className="flex items-center justify-between rounded-lg bg-slate-50 px-3 py-2 text-sm"><span>{n}</span>
                <select value={res[n] ?? "PASS"} onChange={(e) => setRes({ ...res, [n]: e.target.value })} className="rounded border border-line bg-white px-2 py-1 text-sm">{Object.entries(L.test).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select></div>
            ))}
          </div>
          <Field label="ملاحظات (إلزامي عند الفشل)"><input name="notes" className={input} /></Field>
          <button disabled={pending} className={btn.sun}>اعتماد نتيجة الاختبار</button><Msg />
        </form>
      )}
    </Card>
  );
}

function PaymentsPanel({ order, payments, finance, has }: P & { has: (x: string) => boolean }) {
  const { run, pending, Msg } = useAction();
  const canPay = has("payment.create") && order.status !== "CANCELLED";
  if (!has("payment.read") && !payments.length) return null;
  return (
    <Card title="الدفعات والتحصيل">
      {payments.length === 0 ? <Empty title="لا توجد دفعات" /> : (
        <Table head={["الإيصال", "النوع", "الطريقة", "المبلغ", "التاريخ", "ملاحظة"]}>
          {payments.map((x) => <tr key={x.id}><Td><a className="num font-semibold text-navy-700" href={`/print/payment/${x.id}`} target="_blank">{x.number}</a></Td><Td><Pill tone={x.kind === "REFUND" ? "red" : "green"}>{L.payKind[x.kind as keyof typeof L.payKind]}</Pill></Td><Td>{L.method[x.method as keyof typeof L.method]}</Td><Td className={`num font-bold ${x.kind === "REFUND" ? "text-rose-600" : ""}`}>{x.kind === "REFUND" ? "−" : ""}{money(x.amount)}</Td><Td>{dt(x.createdAt)}</Td><Td className="text-slate-500">{x.reason}</Td></tr>)}
        </Table>
      )}
      {canPay && (
        <form className="mt-3 flex flex-wrap items-end gap-2" onSubmit={(e) => { e.preventDefault(); const f = new FormData(e.currentTarget); run("/payments", "POST", { orderId: order.id, kind: Number(finance.due) > 0 ? "PAYMENT" : "DEPOSIT", method: f.get("method"), amount: Number(f.get("amount")) }, { success: "تم تسجيل الدفعة" }).then(() => (e.target as HTMLFormElement).reset?.()); }}>
          <Field label="تحصيل (ج.م)"><input name="amount" type="number" step="0.01" min="0.01" required className={`${input} num w-36`} /></Field>
          <Field label="الطريقة"><select name="method" className={input}>{Object.entries(L.method).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select></Field>
          <button disabled={pending} className={btn.primary}>تسجيل</button>
          {has("payment.refund") && Number(finance.net) > 0 && <button type="button" className={btn.danger} onClick={() => { const a = window.prompt("مبلغ الرد"); const r = a && window.prompt("سبب الرد (إلزامي)"); if (a && r) run("/refunds", "POST", { orderId: order.id, amount: Number(a), reason: r }, { success: "تم تسجيل المرتجع" }); }}>رد مبلغ للعميل</button>}
        </form>
      )}
      <div className="mt-2"><Msg /></div>
    </Card>
  );
}

function Delivery({ order, finance }: P & { has: (x: string) => boolean }) {
  const { run, pending, Msg } = useAction();
  const bal = Number(finance.balance);
  const [override, setOverride] = useState(false);
  return (
    <Card title="التسليم">
      <form className="grid gap-3 md:grid-cols-3" onSubmit={(e) => { e.preventDefault(); const f = new FormData(e.currentTarget); run(`/orders/${order.id}/deliver`, "POST", { receiverName: f.get("receiver"), note: f.get("note"), collect: bal > 0 && !override ? { amount: bal, method: f.get("method") } : undefined, overrideReason: override ? f.get("reason") : undefined, warrantyMonths: Number(f.get("months")) }, { success: "تم التسليم", confirm: "تأكيد التسليم؟ لا يمكن التراجع." }); }}>
        <Field label="اسم المستلم" required><input name="receiver" required className={input} /></Field>
        <Field label="ملاحظات التسليم"><input name="note" className={input} /></Field>
        <Field label="مدة الضمان (شهور)"><input name="months" type="number" min="0" max="36" defaultValue="3" className={`${input} num`} /></Field>
        {bal > 0 && (
          <div className="md:col-span-3 rounded-lg bg-amber-50 p-3 text-sm">
            <p>المتبقي <b className="num">{money(bal)}</b> — {override ? "تسليم باستثناء معتمد" : "سيُحصَّل بالكامل عند التسليم"}</p>
            {!override && <div className="mt-2 max-w-xs"><Field label="طريقة التحصيل"><select name="method" className={input}>{Object.entries(L.method).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select></Field></div>}
            <label className="mt-2 flex items-center gap-2"><input type="checkbox" checked={override} onChange={(e) => setOverride(e.target.checked)} />تسليم دون سداد (استثناء — يتطلب صلاحية المدير)</label>
            {override && <div className="mt-2 max-w-md"><Field label="مبرر الاستثناء" required><input name="reason" required className={input} /></Field></div>}
          </div>
        )}
        <div className="md:col-span-3 flex items-center gap-3"><button disabled={pending} className={btn.sun}>تأكيد التسليم</button><Msg /></div>
      </form>
    </Card>
  );
}

function Timeline({ history, userName }: { history: any[]; userName: Record<string, string> }) {
  return (
    <Card title="رحلة الجهاز">
      <ol className="space-y-3">
        {history.map((h, i) => (
          <li key={h.id} className="flex gap-3">
            {i === history.length - 1 ? <CheckCircle2 size={18} className="mt-0.5 shrink-0 text-sun-600" /> : <Circle size={18} className="mt-0.5 shrink-0 text-slate-300" />}
            <div className="text-sm"><StatusBadge status={h.to} /> <span className="text-xs text-slate-400">{dt(h.createdAt)} · {userName[h.userId]}</span>{h.note && <p className="text-slate-600">{h.note}</p>}</div>
          </li>
        ))}
      </ol>
    </Card>
  );
}
