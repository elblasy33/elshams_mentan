"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { api } from "@/lib/client";
import { btn, input } from "@/components/ui";

export default function Login() {
  const router = useRouter();
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  async function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (busy) return;
    setBusy(true); setErr(null);
    const f = new FormData(e.currentTarget);
    try {
      await api("/auth/login", "POST", { username: f.get("username"), password: f.get("password") });
      router.push("/");
      router.refresh();
    } catch (x) {
      setErr((x as Error).message);
      setBusy(false);
    }
  }
  return (
    <div className="grid min-h-screen place-items-center bg-surface p-4">
      <form onSubmit={submit} className="w-full max-w-sm space-y-4 rounded-2xl bg-white p-8 shadow-2xl">
        <div className="flex flex-col items-center gap-2 pb-2 text-center">
          <img src="/logo.png" alt="الشمس للإلكترونيات" className="h-28 w-28 object-contain" />
          <h1 className="text-xl font-extrabold text-navy-900">شركة الشمس للإلكترونيات الحديثة</h1>
          <p className="text-sm text-slate-500">تسجيل الدخول إلى نظام إدارة الصيانة</p>
        </div>
        <label className="block text-xs font-semibold text-slate-600">اسم المستخدم<input name="username" required autoFocus autoComplete="username" className={`${input} mt-1`} /></label>
        <label className="block text-xs font-semibold text-slate-600">كلمة المرور<input name="password" type="password" required autoComplete="current-password" className={`${input} mt-1`} /></label>
        {err && <p role="alert" className="rounded-lg bg-rose-50 px-3 py-2 text-sm text-rose-700">{err}</p>}
        <button disabled={busy} className={`${btn.primary} w-full py-2.5`}>{busy ? "جارٍ الدخول…" : "دخول"}</button>
      </form>
    </div>
  );
}
