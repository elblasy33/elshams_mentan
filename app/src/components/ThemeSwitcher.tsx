"use client";
import { useEffect, useState } from "react";
import { Sun, Moon, Monitor } from "lucide-react";
import { applyTheme, getTheme, type Theme } from "./theme";

const OPTS: { v: Theme; label: string; Icon: typeof Sun }[] = [
  { v: "light", label: "فاتح", Icon: Sun }, { v: "dark", label: "غامق", Icon: Moon }, { v: "system", label: "تلقائي (حسب الجهاز)", Icon: Monitor },
];

export function ThemeSwitcher() {
  const [t, setT] = useState<Theme>("system");
  useEffect(() => {
    setT(getTheme());
    const mq = matchMedia("(prefers-color-scheme: dark)");
    const h = () => getTheme() === "system" && applyTheme("system");
    mq.addEventListener("change", h);
    return () => mq.removeEventListener("change", h);
  }, []);
  return (
    <div className="flex flex-wrap gap-2">
      {OPTS.map(({ v, label, Icon }) => (
        <button key={v} onClick={() => { setT(v); applyTheme(v); }} aria-pressed={t === v}
          className={`flex items-center gap-2 rounded-lg border px-4 py-2 text-sm font-medium transition ${t === v ? "border-sun-500 bg-sun-500/15 text-navy-900" : "border-line bg-white text-slate-700 hover:bg-slate-50"}`}>
          <Icon size={16} />{label}
        </button>
      ))}
    </div>
  );
}

/** زر تبديل سريع في الرأس */
export function ThemeToggle() {
  const [dark, setDark] = useState(false);
  useEffect(() => {
    const sync = () => setDark(document.documentElement.dataset.theme === "dark");
    sync();
    window.addEventListener("shs-theme", sync);
    return () => window.removeEventListener("shs-theme", sync);
  }, []);
  return (
    <button onClick={() => applyTheme(dark ? "light" : "dark")} aria-label="تبديل المظهر" title={dark ? "الوضع الفاتح" : "الوضع الغامق"} className="rounded-lg p-2 text-slate-600 hover:bg-slate-100">
      {dark ? <Sun size={18} /> : <Moon size={18} />}
    </button>
  );
}
