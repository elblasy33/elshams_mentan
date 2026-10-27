"use client";
import Link from "next/link";
export function PrintButton({ thermal, href }: { thermal: boolean; href: string }) {
  return (
    <div className="no-print mx-auto my-4 flex max-w-[210mm] justify-between gap-2 px-2">
      <div className="flex gap-2">
        <Link href={`${href}?w=a4`} className="rounded-lg border border-line bg-white px-3 py-2 text-sm">A4</Link>
        <Link href={`${href}?w=thermal`} className="rounded-lg border border-line bg-white px-3 py-2 text-sm">إيصال حراري</Link>
      </div>
      <button onClick={() => window.print()} className="rounded-lg bg-brand px-4 py-2 text-sm font-semibold text-on-brand">{thermal ? "طباعة (80mm)" : "طباعة"}</button>
    </div>
  );
}
