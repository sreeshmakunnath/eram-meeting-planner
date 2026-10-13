import { PageHeader } from "@/components/ui";
import { requireAdmin } from "@/lib/auth";
import { GroupForm } from "../group-form";

export default async function NewGroupPage() {
  await requireAdmin();
  return (
    <>
      <PageHeader title="Create group" subtitle="Meetings and tasks can be assigned to a whole group." />
      <GroupForm />
    </>
  );
}
