import { PageHeader } from "@/components/ui";
import { requireUser } from "@/lib/auth";
import { ClientForm } from "../client-form";

export default async function NewClientPage() {
  const me = await requireUser();
  return (
    <>
      <PageHeader title="Add client" />
      <ClientForm me={me} />
    </>
  );
}
