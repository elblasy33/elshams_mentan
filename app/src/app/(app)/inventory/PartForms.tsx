"use client";
import { useState } from "react";
import { useAction } from "@/components/useAction";
import { Card, Field, input, btn } from "@/components/ui";

export function PartForms({ parts, canPrice, canAdjust }: { parts: { id: string; code: string; name: string }[]; canPrice: boolean; canAdjust: boolean }) {
  const [tab, setTab] = useState<"receive" | "new" | "adjust">("receive");
  const { run, pending, Msg } = useAction();
  const tabs = [["receive", "استلام مخزني"], ["new", "قطعة جديدة"], ...(canAdjust ? [["adjust", "تسوية جرد"]] : [])] as [typeof tab, string][];
  return (
    <Card>
      <div className="mb-4 flex gap-2">{tabs.map(([k, v]) => <button key={k} onClick={() => setTab(k)} className={tab === k ? btn.primary : btn.ghost}>{v}</button>)}</div>
      {tab === "new" && (
        <form className="grid gap-3 md:grid-cols-4" onSubmit={async (e) => { e.preventDefault(); const f = new FormData(e.currentTarget); const form = e.currentTarget; const r = await run("/parts", "POST", { code: f.get("code"), name: f.get("name"), category: f.get("category"), salePrice: Number(f.get("salePrice") || 0), reorderLevel: Number(f.get("reorderLevel") || 0), location: f.get("location") }, { success: "تمت إضافة القطعة" }); if (r) form.reset(); }}>
          <Field label="الكود" required><input name="code" required className={`${input} num`} /></Field>
          <Field label="الاسم" required><input name="name" required className={input} /></Field>
          <Field label="التصنيف"><input name="category" className={input} /></Field>
          <Field label="موقع التخزين"><input name="location" className={input} /></Field>
          {canPrice && <Field label="سعر البيع"><input name="salePrice" type="number" step="0.01" min="0" className={`${input} num`} /></Field>}
          <Field label="حد إعادة الطلب"><input name="reorderLevel" type="number" step="0.001" min="0" className={`${input} num`} /></Field>
          <div className="flex items-end"><button disabled={pending} className={btn.primary}>إضافة</button></div>
        </form>
      )}
      {tab === "receive" && (
        <form className="grid gap-3 md:grid-cols-5" onSubmit={async (e) => { e.preventDefault(); const f = new FormData(e.currentTarget); const form = e.currentTarget; const r = await run("/stock/receive", "POST", { partId: f.get("partId"), qty: Number(f.get("qty")), unitCost: Number(f.get("unitCost")), reference: f.get("reference") }, { success: "تم تسجيل الاستلام" }); if (r) form.reset(); }}>
          <Field label="القطعة" required><select name="partId" required className={input}>{parts.map((p) => <option key={p.id} value={p.id}>{p.code} · {p.name}</option>)}</select></Field>
          <Field label="الكمية" required><input name="qty" type="number" step="0.001" min="0.001" required className={`${input} num`} /></Field>
          <Field label="تكلفة الوحدة" required><input name="unitCost" type="number" step="0.01" min="0" required className={`${input} num`} /></Field>
          <Field label="المرجع (فاتورة المورد)"><input name="reference" className={input} /></Field>
          <div className="flex items-end"><button disabled={pending} className={btn.primary}>تسجيل الاستلام</button></div>
        </form>
      )}
      {tab === "adjust" && (
        <form className="grid gap-3 md:grid-cols-4" onSubmit={(e) => { e.preventDefault(); const f = new FormData(e.currentTarget); run("/stock/adjust", "POST", { partId: f.get("partId"), newQty: Number(f.get("newQty")), reason: f.get("reason") }, { success: "تمت التسوية", confirm: "تأكيد تسوية الرصيد؟" }); }}>
          <Field label="القطعة"><select name="partId" className={input}>{parts.map((p) => <option key={p.id} value={p.id}>{p.code} · {p.name}</option>)}</select></Field>
          <Field label="الرصيد الفعلي بعد الجرد"><input name="newQty" type="number" step="0.001" min="0" required className={`${input} num`} /></Field>
          <Field label="السبب" required><input name="reason" required minLength={3} className={input} /></Field>
          <div className="flex items-end"><button disabled={pending} className={btn.primary}>تسوية</button></div>
        </form>
      )}
      <div className="mt-3"><Msg /></div>
    </Card>
  );
}
