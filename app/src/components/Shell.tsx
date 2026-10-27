"use client";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useState, type ReactNode } from "react";
import { LayoutDashboard, Wrench, Users, Boxes, Wallet, BarChart3, UserCog, LogOut, Menu, PanelRightClose, PanelRightOpen, Settings, X } from "lucide-react";
import { api } from "@/lib/client";
import { ThemeToggle } from "./ThemeSwitcher";

const ICONS = { dash: LayoutDashboard, orders: Wrench, customers: Users, stock: Boxes, pay: Wallet, reports: BarChart3, users: UserCog, settings: Settings };
export type NavItem = { href: string; label: string; icon: keyof typeof ICONS };
const KEY = "shs_sidebar";

export function Shell({ nav, user, children }: { nav: NavItem[]; user: { name: string; role: string }; children: ReactNode }) {
  const path = usePathname();
  const router = useRouter();
  const [drawer, setDrawer] = useState(false); // الجوال
  const [hidden, setHidden] = useState(false); // سطح المكتب: انزلاق القائمة للخارج
  useEffect(() => { try { setHidden(localStorage.getItem(KEY) === "hidden"); } catch {} }, []);
  useEffect(() => setDrawer(false), [path]);
  const toggle = () => setHidden((h) => { try { localStorage.setItem(KEY, h ? "open" : "hidden"); } catch {} return !h; });
  const logout = async () => { await api("/auth/logout", "POST"); router.push("/login"); router.refresh(); };

  const content = (
    <div className="flex h-full w-64 flex-col border-e border-[var(--sb-border)] bg-[var(--sb-bg)] text-[var(--sb-text)]">
      <div className="flex items-center gap-3 px-4 py-5">
        <div className="grid h-11 w-11 shrink-0 place-items-center overflow-hidden rounded-xl bg-[#fff] p-0.5 ring-1 ring-[var(--sb-border)]"><img src="/logo.png" alt="الشمس" className="h-full w-full object-contain" /></div>
        <div className="min-w-0 flex-1 leading-tight"><div className="truncate text-sm font-extrabold text-navy-900">الشمس للإلكترونيات</div><div className="text-[11px] text-[var(--sb-muted)]">إدارة الصيانة</div></div>
        <button className="rounded p-1 hover:bg-[var(--sb-hover)] lg:hidden" onClick={() => setDrawer(false)} aria-label="إغلاق"><X size={18} /></button>
      </div>
      <nav className="flex-1 space-y-1 overflow-y-auto px-3">
        {nav.map((n) => {
          const Icon = ICONS[n.icon];
          const active = n.href === "/" ? path === "/" : path.startsWith(n.href);
          return (
            <Link key={n.href} href={n.href}
              className={`flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition ${active ? "bg-sun-500 text-navy-950" : "hover:bg-[var(--sb-hover)]"}`}>
              <Icon size={18} className="shrink-0" />{n.label}
            </Link>
          );
        })}
      </nav>
      <div className="border-t border-[var(--sb-border)] p-3">
        <div className="mb-2 px-2 text-xs"><div className="font-semibold text-navy-900">{user.name}</div><div className="text-[var(--sb-muted)]">{user.role}</div></div>
        <button onClick={logout} className="flex w-full items-center gap-3 rounded-lg px-3 py-2 text-sm hover:bg-[var(--sb-hover)]"><LogOut size={18} />تسجيل الخروج</button>
      </div>
    </div>
  );

  return (
    <div className="flex min-h-screen">
      {/* سطح المكتب: ينزلق للخارج ويحرر المساحة */}
      <div className={`no-print sticky top-0 hidden h-screen shrink-0 overflow-hidden transition-[width] duration-300 ease-in-out lg:block ${hidden ? "w-0" : "w-64"}`}>{content}</div>
      {/* الجوال/التابلت: درج منزلق */}
      <div className={`no-print fixed inset-0 z-40 lg:hidden ${drawer ? "" : "pointer-events-none"}`}>
        <div className={`absolute inset-0 bg-black/40 transition-opacity duration-300 ${drawer ? "opacity-100" : "opacity-0"}`} onClick={() => setDrawer(false)} />
        <div className={`absolute inset-y-0 start-0 transition-transform duration-300 ease-in-out ${drawer ? "translate-x-0" : "translate-x-full"}`}>{content}</div>
      </div>
      <div className="flex min-w-0 flex-1 flex-col">
        <header className="no-print sticky top-0 z-30 flex items-center gap-2 border-b border-line bg-white/90 px-3 py-3 backdrop-blur md:px-4">
          <button className="rounded-lg p-2 text-slate-600 hover:bg-slate-100 lg:hidden" onClick={() => setDrawer(true)} aria-label="القائمة"><Menu size={20} /></button>
          <button className="hidden rounded-lg p-2 text-slate-600 hover:bg-slate-100 lg:block" onClick={toggle} aria-label={hidden ? "إظهار القائمة" : "إخفاء القائمة"} title={hidden ? "إظهار القائمة" : "إخفاء القائمة"}>{hidden ? <PanelRightOpen size={18} /> : <PanelRightClose size={18} />}</button>
          <form action="/orders" className="min-w-0 max-w-md flex-1"><input name="search" placeholder="بحث سريع…" className="w-full rounded-lg border border-line bg-surface px-3 py-2 text-sm outline-none focus:border-navy-700" /></form>
          <div className="ms-auto"><ThemeToggle /></div>
        </header>
        <main className="mx-auto w-full max-w-[1500px] flex-1 p-3 sm:p-4 md:p-6">{children}</main>
      </div>
    </div>
  );
}
