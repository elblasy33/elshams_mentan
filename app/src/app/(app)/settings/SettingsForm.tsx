"use client";
import { useAction } from "@/components/useAction";
import { Card, Field, input, btn } from "@/components/ui";

export function SettingsForm({ initial }: { initial: Record<string, any> }) {
  const { run, pending, Msg } = useAction();
  return (
    <Card>
      <form className="grid gap-3 md:grid-cols-2" onSubmit={(e) => { e.preventDefault(); const f = new FormData(e.currentTarget); run("/settings", "PUT", { companyName: f.get("companyName"), companyPhone: f.get("companyPhone"), companyAddress: f.get("companyAddress"), defaultWarrantyMonths: Number(f.get("defaultWarrantyMonths")), quoteValidityDays: Number(f.get("quoteValidityDays")), taxRate: Number(f.get("taxRate")), allowNegativeStock: f.get("allowNegativeStock") === "on", deliveryTerms: f.get("deliveryTerms") }, { success: "تم حفظ الإعدادات" }); }}>
        <Field label="اسم الشركة"><input name="companyName" defaultValue={initial.companyName} className={input} /></Field>
        <Field label="هاتف الشركة"><input name="companyPhone" defaultValue={initial.companyPhone} className={input} /></Field>
        <div className="md:col-span-2"><Field label="عنوان الشركة"><input name="companyAddress" defaultValue={initial.companyAddress} className={input} /></Field></div>
        <Field label="مدة الضمان الافتراضية (شهور)"><input name="defaultWarrantyMonths" type="number" min="0" defaultValue={initial.defaultWarrantyMonths} className={input} /></Field>
        <Field label="صلاحية عرض السعر (أيام)"><input name="quoteValidityDays" type="number" min="1" defaultValue={initial.quoteValidityDays} className={input} /></Field>
        <Field label="نسبة الضريبة % (0 = بدون)"><input name="taxRate" type="number" step="0.01" min="0" defaultValue={initial.taxRate} className={input} /></Field>
        <label className="flex items-center gap-2 self-end text-sm"><input type="checkbox" name="allowNegativeStock" defaultChecked={initial.allowNegativeStock} />السماح بالمخزون السالب (غير مفضل — يُسجَّل في التدقيق)</label>
        <div className="md:col-span-2"><Field label="شروط التسليم (تظهر في المستندات)"><textarea name="deliveryTerms" rows={3} defaultValue={initial.deliveryTerms} className={input} /></Field></div>
        <div className="flex items-center gap-3"><button disabled={pending} className={btn.primary}>حفظ</button><Msg /></div>
      </form>
    </Card>
  );
}
