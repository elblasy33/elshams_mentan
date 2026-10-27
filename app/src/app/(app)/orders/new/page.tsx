import { requireCtx } from "@/server/session";
import { listDeviceTypes } from "@/server/services/customers";
import { listStaff } from "@/server/services/users";
import { PageHeader } from "@/components/ui";
import { NewOrderForm } from "./NewOrderForm";

export default async function NewOrder() {
  const ctx = await requireCtx();
  const [types, staff] = await Promise.all([listDeviceTypes(), listStaff(ctx)]);
  return (
    <>
      <PageHeader title="استلام جهاز — أمر صيانة جديد" />
      <NewOrderForm types={types.map((t) => ({ id: t.id, name: t.nameAr }))} staff={staff} canAssign={ctx.perms.has("order.assign")} canPay={ctx.perms.has("payment.create")} />
    </>
  );
}
