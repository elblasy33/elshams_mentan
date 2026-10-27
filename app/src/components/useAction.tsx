"use client";
import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { api } from "@/lib/client";

/**
 * ينفذ طلبًا مع منع الإرسال المتكرر، ويعرض الخطأ كما يعيده الخادم، ويحدّث الصفحة بعد النجاح.
 * يولّد مفتاح idempotency ثابتًا لكل محاولة منطقية (يتجدد بعد النجاح فقط) فتكون إعادة الضغط آمنة.
 */
export function useAction() {
  const router = useRouter();
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [ok, setOk] = useState<string | null>(null);
  const key = useRef(crypto.randomUUID());

  async function run<T>(path: string, method: string, body?: unknown, opts: { success?: string; confirm?: string; onDone?: (r: T) => void; refresh?: boolean } = {}) {
    if (pending) return;
    if (opts.confirm && !window.confirm(opts.confirm)) return;
    setPending(true); setError(null); setOk(null);
    try {
      const payload = body && typeof body === "object" ? { idempotencyKey: key.current, ...body } : body;
      const r = await api<T>(path, method, payload);
      key.current = crypto.randomUUID();
      setOk(opts.success ?? "تم الحفظ");
      opts.onDone?.(r);
      if (opts.refresh !== false) router.refresh();
      return r;
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setPending(false);
    }
  }
  const Msg = () => (error ? <p role="alert" className="rounded-lg bg-rose-50 px-3 py-2 text-sm text-rose-700">{error}</p> : ok ? <p className="rounded-lg bg-emerald-50 px-3 py-2 text-sm text-emerald-700">{ok}</p> : null);
  return { run, pending, error, Msg, setError };
}
