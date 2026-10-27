"use client";
export default function Error({ reset }: { error: Error; reset: () => void }) {
  return <div className="grid min-h-[60vh] place-items-center text-center"><div><h1 className="text-2xl font-extrabold text-navy-900">حدث خطأ غير متوقع</h1><p className="mt-2 text-slate-500">لم تفقد بياناتك. حاول مرة أخرى.</p><button onClick={reset} className="mt-4 rounded-lg bg-brand px-4 py-2 text-on-brand">إعادة المحاولة</button></div></div>;
}
