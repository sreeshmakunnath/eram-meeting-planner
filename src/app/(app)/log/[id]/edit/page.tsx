import { eq } from "drizzle-orm";
import { notFound, redirect } from "next/navigation";
import { PageHeader } from "@/components/ui";
import { db, schema } from "@/db";
import { requireUser } from "@/lib/auth";
import { canEditLog, EDIT_DAYS } from "@/lib/daily-log";
import { LogForm } from "../../log-form";
import { logFormOptions } from "../../options";

export default async function EditLogPage(props: { params: Promise<{ id: string }> }) {
  const params = await props.params;
  const me = await requireUser();
  const id = Number(params.id);
  if (!Number.isInteger(id)) notFound();
  const [entry] = await db.select().from(schema.dailyLogs).where(eq(schema.dailyLogs.id, id));
  if (!entry) notFound();
  if (!canEditLog(me, entry)) redirect("/log?msg=locked");
  const options = await logFormOptions(me, { taskId: entry.taskId, meetingId: entry.meetingId });
  // Keep an older meeting on the list so the link isn't lost on save
  if (entry.meetingId && !options.meetings.some((m) => m.id === entry.meetingId)) {
    const [m] = await db.select({ id: schema.meetings.id, title: schema.meetings.title }).from(schema.meetings).where(eq(schema.meetings.id, entry.meetingId));
    if (m) options.meetings.push({ id: m.id, name: m.title });
  }
  return (
    <>
      <PageHeader title="Edit log entry" subtitle={`You can change your entries for ${EDIT_DAYS} days after writing them.`} />
      <section className="card p-4">
        <LogForm options={options} entry={entry} />
      </section>
    </>
  );
}
