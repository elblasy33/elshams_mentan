import { requireCtx } from "@/server/session";
import { getSettings } from "@/server/settings";
import { PageHeader, Card } from "@/components/ui";
import { ThemeSwitcher } from "@/components/ThemeSwitcher";
import { SettingsForm } from "./SettingsForm";

export default async function Settings() {
  const ctx = await requireCtx();
  const admin = ctx.perms.has("settings.manage");
  return (
    <>
      <PageHeader title="الإعدادات" sub="المظهر خاص بهذا المتصفح؛ سياسات التشغيل للمدير فقط" />
      <Card title="المظهر" className="mb-4">
        <p className="mb-3 text-sm text-slate-500">اختر الوضع الفاتح أو الغامق، أو اتركه تلقائيًا حسب إعداد جهازك. يُحفظ في هذا المتصفح.</p>
        <ThemeSwitcher />
      </Card>
      {admin && <SettingsForm initial={await getSettings()} />}
    </>
  );
}
