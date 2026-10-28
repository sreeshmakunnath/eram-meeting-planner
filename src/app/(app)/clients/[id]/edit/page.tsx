import { eq } from "drizzle-orm";
import { notFound } from "next/navigation";
import { PageHeader } from "@/components/ui";
import { db, schema } from "@/db";
import { canManageClient, canSeeClient } from "@/lib/access";
import { requireUser } from "@/lib/auth";
import { ClientForm } from "../../client-form";

export default async function EditClientPage({ params }: { params: { id: string } }) {
  const me = await requireUser();
  const id = Number(params.id);
  const [client] = Number.isInteger(id) ? await db.select().from(schema.clients).where(eq(schema.clients.id, id)) : [];
  if (!client) notFound();
  // Anyone who can see the client edits its details; owner and business units need canManageClient
  if (!(await canSeeClient(me, id))) notFound();
  const full = await canManageClient(me, client);
  const bus = await db.select().from(schema.clientBusinessUnits).where(eq(schema.clientBusinessUnits.clientId, id));
  return (
    <>
      <PageHeader title={`Edit ${client.name}`} />
      <ClientForm me={me} client={client} buIds={bus.map((b) => b.businessUnitId)} limited={!full} />
    </>
  );
}
