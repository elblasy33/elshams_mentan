import Link from "next/link";
export default function NotFound() {
  return <div className="grid min-h-[60vh] place-items-center text-center"><div><h1 className="text-5xl font-extrabold text-navy-900">404</h1><p className="mt-2 text-slate-500">الصفحة غير موجودة</p><Link href="/" className="mt-4 inline-block text-navy-700 underline">العودة للرئيسية</Link></div></div>;
}
