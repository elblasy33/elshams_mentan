"use client";
import { uuid } from "@/lib/uuid";
import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Search, UserPlus } from "lucide-react";
import { api } from "@/lib/client";
import { Card, Field, input, btn } from "@/components/ui";
import { L } from "@/lib/labels";

type Cust = { id: string; name: string; phone: string; code: string };
type Dev = { id: string; brand: string | null; model: string | null; serial: string | null; type: { nameAr: string } };

export function NewOrderForm({ types, staff, canAssign, canPay }: { types: { id: string; name: string }[]; staff: { id: string; name: string }[]; canAssign: boolean; canPay: boolean }) {
  const router = useRouter();
  const [q, setQ] = useState("");
  const [results, setResults] = useState<Cust[]>([]);
  const [cust, setCust] = useState<Cust | null>(null);
  const [devices, setDevices] = useState<Dev[]>([]);
  const [deviceId, setDeviceId] = useState("");
  const [dirty, setDirty] = useState(false);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const key = useRef(uuid());
  // تسجيل عميل سريع
  const [quick, setQuick] = useState(false);

  useEffect(() => {
    if (q.trim().length < 2) { setResults([]); return; }
    const t = setTimeout(() => api<{ items: Cust[] }>(`/customers?search=${encodeURIComponent(q)}`).then((r) => setResults(r.items)).catch(() => {}), 300);
    return () => clearTimeout(t);
  }, [q]);

  useEffect(() => {
    if (!dirty) return;
    const h = (e: BeforeUnloadEvent) => { e.preventDefault(); };
    window.addEventListener("beforeunload", h);
    return () => window.removeEventListener("beforeunload", h);
  }, [dirty]);

  async function pick(c: Cust) {
    setCust(c); setResults([]); setQ(""); setDirty(true);
    const ds = await api<Dev[]>(`/customers/${c.id}/devices`);
    setDevices(ds); setDeviceId("");
  }
  async function quickCustomer(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    setErr(null);
    try {
      const c = await api<Cust>("/customers", "POST", { name: f.get("name"), phone: f.get("phone"), type: f.get("type") });
      setQuick(false); await pick(c);
    } catch (x) { setErr((x as Error).message); }
  }

  async function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (busy || !cust) return;
    const f = new FormData(e.currentTarget);
    const g = (k: string) => (f.get(k) as string) || undefined;
    const dep = Number(f.get("deposit"));
    setBusy(true); setErr(null);
    try {
      const o = await api<{ id: string }>("/orders", "POST", {
        customerId: cust.id,
        ...(deviceId ? { deviceId } : { newDevice: { typeId: g("typeId"), brand: g("brand"), model: g("model"), serial: g("serial"), size: g("size"), color: g("color") } }),
        intakeChannel: g("intakeChannel"), executionMode: g("executionMode"), priority: g("priority"),
        complaint: g("complaint"), intakeCondition: g("intakeCondition"), accessories: g("accessories"),
        expectedAt: g("expectedAt"), technicianId: g("technicianId"), customerNotes: g("customerNotes"),
        ...(dep > 0 && canPay ? { deposit: { amount: dep, method: g("depositMethod") } } : {}),
        idempotencyKey: key.current,
      });
      setDirty(false);
      router.push(`/orders/${o.id}`);
    } catch (x) { setErr((x as Error).message); setBusy(false); }
  }

  return (
    <>
    <form id="qc" onSubmit={quickCustomer} />
    <form onSubmit={submit} onChange={() => setDirty(true)} className="space-y-4">
      <Card title="1. العميل">
        {cust ? (
          <div className="flex items-center justify-between rounded-lg bg-slate-50 p-3">
            <div><div className="font-bold">{cust.name}</div><div className="text-sm text-slate-500"><span className="num">{cust.phone}</span> · {cust.code}</div></div>
            <button type="button" className={btn.ghost} onClick={() => { setCust(null); setDevices([]); setDeviceId(""); }}>تغيير</button>
          </div>
        ) : (
          <div className="space-y-2">
            <div className="relative">
              <Search size={16} className="absolute start-3 top-3 text-slate-400" />
              <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="ابحث بالاسم أو رقم الموبايل أو كود العميل…" className={`${input} ps-9`} />
              {results.length > 0 && (
                <ul className="absolute z-10 mt-1 w-full overflow-hidden rounded-lg border border-line bg-white shadow-lg">
                  {results.map((c) => <li key={c.id}><button type="button" onClick={() => pick(c)} className="flex w-full justify-between px-3 py-2 text-start text-sm hover:bg-slate-50"><span>{c.name}</span><span className="num text-slate-400">{c.phone}</span></button></li>)}
                </ul>
              )}
            </div>
            <button type="button" onClick={() => setQuick(!quick)} className="flex items-center gap-1 text-sm font-semibold text-navy-700"><UserPlus size={15} />عميل جديد</button>
            {quick && (
              <div className="grid gap-2 rounded-lg border border-line p-3 md:grid-cols-4">
                <input name="name" form="qc" placeholder="الاسم" required className={input} />
                <input name="phone" form="qc" placeholder="الموبايل" required className={input} />
                <select name="type" form="qc" className={input}>{Object.entries(L.customerType).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select>
                <button form="qc" className={btn.primary}>حفظ واختيار</button>
              </div>
            )}
          </div>
        )}
      </Card>

      {cust && (<>
        <Card title="2. الجهاز">
          {devices.length > 0 && (
            <Field label="جهاز مسجل لهذا العميل">
              <select value={deviceId} onChange={(e) => setDeviceId(e.target.value)} className={input}>
                <option value="">— جهاز جديد —</option>
                {devices.map((d) => <option key={d.id} value={d.id}>{d.type.nameAr} {d.brand} {d.model} {d.serial ? `(${d.serial})` : ""}</option>)}
              </select>
            </Field>
          )}
          {!deviceId && (
            <div className="mt-3 grid gap-3 md:grid-cols-3">
              <Field label="نوع الجهاز" required><select name="typeId" required className={input}>{types.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}</select></Field>
              <Field label="الماركة"><input name="brand" className={input} /></Field>
              <Field label="الموديل"><input name="model" className={input} /></Field>
              <Field label="الرقم المسلسل" hint="اتركه فارغًا إن لم يوجد"><input name="serial" className={`${input} num`} /></Field>
              <Field label="المقاس"><input name="size" className={input} /></Field>
              <Field label="اللون"><input name="color" className={input} /></Field>
            </div>
          )}
        </Card>
        <Card title="3. الشكوى وتفاصيل الاستلام">
          <div className="grid gap-3 md:grid-cols-2">
            <div className="md:col-span-2"><Field label="شكوى العميل" required><textarea name="complaint" required minLength={3} rows={3} className={input} /></Field></div>
            <Field label="الحالة الخارجية عند الاستلام"><input name="intakeCondition" placeholder="خدوش، كسر، ..." className={input} /></Field>
            <Field label="الملحقات المستلمة"><input name="accessories" placeholder="ريموت، كابل، حامل…" className={input} /></Field>
            <Field label="قناة الاستلام"><select name="intakeChannel" className={input}>{Object.entries(L.channel).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select></Field>
            <Field label="طريقة التنفيذ"><select name="executionMode" className={input}><option value="INTERNAL">{L.mode.INTERNAL}</option></select></Field>
            <Field label="الأولوية"><select name="priority" className={input}>{Object.entries(L.priority).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select></Field>
            <Field label="الموعد المتوقع"><input type="date" name="expectedAt" className={input} /></Field>
            {canAssign && <Field label="الفني المسؤول"><select name="technicianId" className={input}><option value="">— غير مسند —</option>{staff.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}</select></Field>}
            <Field label="ملاحظات العميل"><input name="customerNotes" className={input} /></Field>
          </div>
        </Card>
        {canPay && (
          <Card title="4. العربون (اختياري)">
            <div className="grid gap-3 md:grid-cols-3">
              <Field label="قيمة العربون (ج.م)"><input type="number" step="0.01" min="0" name="deposit" className={`${input} num`} /></Field>
              <Field label="طريقة الدفع"><select name="depositMethod" className={input}>{Object.entries(L.method).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select></Field>
            </div>
          </Card>
        )}
      </>)}
      {err && <p role="alert" className="rounded-lg bg-rose-50 px-3 py-2 text-sm text-rose-700">{err}</p>}
      <div className="flex gap-2"><button disabled={!cust || busy} className={btn.sun}>{busy ? "جارٍ الحفظ…" : "حفظ وفتح الأمر"}</button></div>
    </form>
    </>
  );
}
