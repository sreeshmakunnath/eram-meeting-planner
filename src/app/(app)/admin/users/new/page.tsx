import { PageHeader } from "@/components/ui";
import { createUser } from "@/lib/actions/users";
import { requireAdmin } from "@/lib/auth";
import { UserForm } from "../user-form";

export default async function NewUserPage() {
  await requireAdmin();
  return (
    <>
      <PageHeader title="Add user" subtitle="Set a password now, or leave it blank and the user gets a welcome email with a link to set their own." />
      <UserForm action={createUser} />
    </>
  );
}
