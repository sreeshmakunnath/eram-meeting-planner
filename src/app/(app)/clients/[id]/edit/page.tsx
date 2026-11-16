import { eq } from "drizzle-orm";
import { notFound } from "next/navigation";
import { PageHeader } from "@/components/ui";
import { db, schema } from "@/db";
import { canManageClient, canSeeClient } from "@/lib/access";
import { requireUser } from "@/lib/auth";
import { ClientForm } from "../../client-form";

export default async function EditClientPage(props: { params: Promise<{ id: string }> }) {
  const params = await props.params;
  const me = await requireUser();
  const id = Number(params.id);
  const [client] = Number.isInteger(id) ? await db.select().from(schema.clients).where(eq(schema.clients.id, id)) : [];
  if (!client) notFound();
  // Anyone who can see the client edits its details; owner and business unit need canManageClient
  if (!(await canSeeClient(me, id))) notFound();
  const full = await canManageClient(me, client);
  return (
    <>
      <PageHeader title={`Edit ${client.name}`} />
      <ClientForm me={me} client={client} limited={!full} />
    </>
  );
}
