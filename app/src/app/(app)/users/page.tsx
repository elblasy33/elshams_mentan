import { redirect } from "next/navigation";
import { requireCtx } from "@/server/session";
import { listUsers } from "@/server/services/users";
import { Card, PageHeader, Table, Td, Pill } from "@/components/ui";
import { L } from "@/lib/labels";
import { dt } from "@/lib/format";
import { UserForm } from "./UserForm";

export default async function Users() {
  const ctx = await requireCtx();
  if (!ctx.perms.has("user.manage")) redirect("/");
  const users = await listUsers(ctx);
  return (
    <>
      <PageHeader title="المستخدمون والصلاحيات" />
      <UserForm />
      <Card className="mt-4">
        <Table head={["الاسم", "اسم الدخول", "الدور", "الحالة", "تاريخ الإنشاء", ""]}>
          {users.map((u) => (
            <tr key={u.id}><Td>{u.name}</Td><Td><span className="num">{u.username}</span></Td><Td>{L.role[u.role]}</Td><Td><Pill tone={u.active ? "green" : "red"}>{u.active ? "نشط" : "معطل"}</Pill></Td><Td>{dt(u.createdAt)}</Td><Td><UserForm toggle={{ id: u.id, active: u.active }} /></Td></tr>
          ))}
        </Table>
      </Card>
    </>
  );
}
