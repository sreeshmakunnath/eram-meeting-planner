import { eq } from "drizzle-orm";
import { notFound, redirect } from "next/navigation";
import { Notice, PageHeader } from "@/components/ui";
import { db, schema } from "@/db";
import { saveMeeting } from "@/lib/actions/meetings";
import { requireUser } from "@/lib/auth";
import { canEditMeeting, riyadhParts } from "@/lib/meetings";
import { meetingFormOptions, meetingSelections } from "../../form-options";
import { MeetingForm } from "../../meeting-form";

export default async function EditMeetingPage({ params, searchParams }: { params: { id: string }; searchParams: { msg?: string } }) {
  const me = await requireUser();
  const id = Number(params.id);
  const [m] = Number.isInteger(id) ? await db.select().from(schema.meetings).where(eq(schema.meetings.id, id)) : [];
  if (!m) notFound();
  if (!canEditMeeting(me, m)) redirect(`/meetings/${id}?msg=denied`);
  const [options, sel] = await Promise.all([meetingFormOptions(), meetingSelections(id)]);
  const start = m.startAt ? riyadhParts(m.startAt) : null;
  const end = m.endAt ? riyadhParts(m.endAt) : null;
  return (
    <>
      <PageHeader title={`Edit: ${m.title}`} />
      {searchParams.msg === "needdate" && <Notice tone="error">Set a date before marking this meeting Confirmed or Completed.</Notice>}
      <MeetingForm
        action={saveMeeting}
        options={options}
        cancelHref={`/meetings/${id}`}
        defaults={{
          ...m,
          followUpDate: m.followUpDate?.slice(0, 10) ?? null,
          date: start?.date ?? "",
          startTime: start?.time,
          endTime: end?.time,
          ...sel,
        }}
      />
    </>
  );
}
