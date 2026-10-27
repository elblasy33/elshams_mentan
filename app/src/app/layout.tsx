import type { Metadata } from "next";
import { Cairo } from "next/font/google";
import "./globals.css";

const cairo = Cairo({ subsets: ["arabic", "latin"], variable: "--font-cairo", display: "swap" });

// يحدد المظهر قبل أول رسم لتفادي وميض الفاتح/الغامق
const THEME_SCRIPT = `try{var t=localStorage.getItem("shs_theme")||"system";var d=t==="dark"||(t==="system"&&matchMedia("(prefers-color-scheme: dark)").matches);document.documentElement.dataset.theme=d?"dark":"light"}catch(e){}`;

export const metadata: Metadata = {
  other: { "color-scheme": "light" }, title: "الشمس للإلكترونيات الحديثة — إدارة الصيانة" };

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="ar" dir="rtl" className={cairo.variable} suppressHydrationWarning>
      <head><script dangerouslySetInnerHTML={{ __html: THEME_SCRIPT }} /></head>
      <body className="font-sans antialiased">{children}</body>
    </html>
  );
}
