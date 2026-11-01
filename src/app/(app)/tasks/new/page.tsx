import { eq } from "drizzle-orm";
import { PageHeader } from "@/components/ui";
import { db, schema } from "@/db";
import { requireUser } from "@/lib/auth";
import { TaskForm } from "../task-form";

export default async function NewTaskPage(props: { searchParams: Promise<{ meeting?: string; client?: string }> }) {
  const searchParams = await props.searchParams;
  const me = await requireUser();
  const meetingId = Number(searchParams.meeting) || null;
  const [m] = meetingId ? await db.select({ clientId: schema.meetings.clientId }).from(schema.meetings).where(eq(schema.meetings.id, meetingId)) : [];
  return (
    <>
      <PageHeader title="New task" />
      <TaskForm me={me} userIds={[me.id]} defaults={{ meetingId, clientId: m?.clientId ?? (Number(searchParams.client) || null) }} />
    </>
  );
}
