import { redirect } from "next/navigation";
import { currentUser } from "@/server/session";
import { Shell, type NavItem } from "@/components/Shell";
import { L } from "@/lib/labels";

export const dynamic = "force-dynamic";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const u = await currentUser();
  if (!u) redirect("/login");
  const has = (p: string) => u.ctx.perms.has(p);
  const nav: NavItem[] = [
    { href: "/", label: "لوحة التحكم", icon: "dash" as const },
    has("order.read") && { href: "/orders", label: "أوامر الصيانة", icon: "orders" as const },
    has("customer.read") && { href: "/customers", label: "العملاء", icon: "customers" as const },
    has("stock.read") && { href: "/inventory", label: "المخزون", icon: "stock" as const },
    has("payment.read") && { href: "/payments", label: "التحصيلات", icon: "pay" as const },
    has("report.read") && { href: "/reports", label: "التقارير", icon: "reports" as const },
    has("user.manage") && { href: "/users", label: "المستخدمون", icon: "users" as const },
    { href: "/settings", label: "الإعدادات", icon: "settings" as const },
  ].filter(Boolean) as NavItem[];
  return <Shell nav={nav} user={{ name: u.name, role: L.role[u.role] }}>{children}</Shell>;
}
