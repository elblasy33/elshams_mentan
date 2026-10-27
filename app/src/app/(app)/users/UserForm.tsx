"use client";
import { useAction } from "@/components/useAction";
import { Card, Field, input, btn } from "@/components/ui";
import { L } from "@/lib/labels";

export function UserForm({ toggle }: { toggle?: { id: string; active: boolean } }) {
  const { run, pending, Msg } = useAction();
  if (toggle)
    return (
      <div className="flex gap-2">
        <button disabled={pending} className={btn.ghost} onClick={() => run(`/users/${toggle.id}`, "PATCH", { active: !toggle.active })}>{toggle.active ? "تعطيل" : "تفعيل"}</button>
        <button disabled={pending} className={btn.ghost} onClick={() => { const p = window.prompt("كلمة مرور جديدة (8 أحرف على الأقل)"); if (p) run(`/users/${toggle.id}`, "PATCH", { password: p }, { success: "تم تغيير كلمة المرور" }); }}>كلمة مرور</button>
      </div>
    );
  return (
    <Card title="مستخدم جديد">
      <form className="grid gap-3 md:grid-cols-5" onSubmit={async (e) => { e.preventDefault(); const f = new FormData(e.currentTarget); const form = e.currentTarget; const r = await run("/users", "POST", Object.fromEntries(f.entries()), { success: "تم إنشاء المستخدم" }); if (r) form.reset(); }}>
        <Field label="الاسم" required><input name="name" required className={input} /></Field>
        <Field label="اسم الدخول" required><input name="username" required className={input} /></Field>
        <Field label="كلمة المرور" required><input name="password" type="password" minLength={8} required className={input} autoComplete="new-password" /></Field>
        <Field label="الدور"><select name="role" className={input}>{Object.entries(L.role).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select></Field>
        <div className="flex items-end"><button disabled={pending} className={btn.primary}>إنشاء</button></div>
      </form>
      <div className="mt-2"><Msg /></div>
    </Card>
  );
}
