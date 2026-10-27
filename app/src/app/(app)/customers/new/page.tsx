"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { api } from "@/lib/client";
import { Card, Field, PageHeader, input, btn } from "@/components/ui";
import { L } from "@/lib/labels";

export default function NewCustomer() {
  const router = useRouter();
  const [err, setErr] = useState<string | null>(null);
  const [dup, setDup] = useState(false);
  const [busy, setBusy] = useState(false);
  async function submit(e: React.FormEvent<HTMLFormElement>, force = false) {
    e.preventDefault();
    if (busy) return;
    const f = new FormData(e.currentTarget);
    const body: Record<string, unknown> = Object.fromEntries(f.entries());
    setBusy(true); setErr(null);
    try {
      const c = await api<{ id: string }>("/customers", "POST", { ...body, force });
      router.push(`/customers/${c.id}`);
    } catch (x) {
      setErr((x as Error).message);
      setDup((x as { code?: string }).code === "DUPLICATE_CUSTOMER");
      setBusy(false);
    }
  }
  return (
    <>
      <PageHeader title="عميل جديد" />
      <Card>
        <form onSubmit={(e) => submit(e)} className="grid gap-3 md:grid-cols-2">
          <Field label="الاسم" required><input name="name" required className={input} /></Field>
          <Field label="نوع العميل"><select name="type" className={input}>{Object.entries(L.customerType).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select></Field>
          <Field label="رقم الموبايل" required><input name="phone" required inputMode="tel" className={`${input} num`} /></Field>
          <Field label="رقم بديل"><input name="phone2" inputMode="tel" className={`${input} num`} /></Field>
          <Field label="البريد الإلكتروني"><input name="email" type="email" className={input} /></Field>
          <Field label="الرقم الضريبي"><input name="taxNo" className={input} /></Field>
          <div className="md:col-span-2"><Field label="العنوان"><input name="address" className={input} /></Field></div>
          <div className="md:col-span-2"><Field label="ملاحظات"><textarea name="notes" rows={2} className={input} /></Field></div>
          {err && <p role="alert" className="md:col-span-2 rounded-lg bg-rose-50 px-3 py-2 text-sm text-rose-700">{err}</p>}
          <div className="md:col-span-2 flex gap-2">
            <button disabled={busy} className={btn.sun}>حفظ العميل</button>
            {dup && <button type="button" disabled={busy} className={btn.ghost} onClick={(e) => submit({ preventDefault() {}, currentTarget: (e.currentTarget as HTMLElement).closest("form") } as never, true)}>حفظ رغم التشابه</button>}
          </div>
        </form>
      </Card>
    </>
  );
}
