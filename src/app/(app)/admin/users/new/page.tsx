import { PageHeader } from "@/components/ui";
import { createUser } from "@/lib/actions/users";
import { requireAdmin } from "@/lib/auth";
import { UserForm } from "../user-form";

export default async function NewUserPage() {
  await requireAdmin();
  return (
    <>
      <PageHeader title="Add user" subtitle="The user receives a welcome email with a link to set their password." />
      <UserForm action={createUser} />
    </>
  );
}
