import { PageHeader } from "@/components/ui";
import { saveMeeting } from "@/lib/actions/meetings";
import { requireUser } from "@/lib/auth";
import { meetingFormOptions } from "../form-options";
import { MeetingForm } from "../meeting-form";

export default async function NewMeetingPage({ searchParams }: { searchParams: { date?: string; client?: string } }) {
  const me = await requireUser();
  const date = /^\d{4}-\d{2}-\d{2}$/.test(searchParams.date ?? "") ? searchParams.date : "";
  const clientId = Number(searchParams.client) || null;
  const options = await meetingFormOptions(me);
  return (
    <>
      <PageHeader title="New meeting" subtitle="Same fields as the Client Meeting Planner sheet." />
      <MeetingForm
        action={saveMeeting}
        options={options}
        cancelHref="/meetings"
        defaults={{ date, status: date ? "SCHEDULED" : "TO_BE_SCHEDULED", clientId, userIds: [me.id], ownerIds: [me.id] }}
      />
    </>
  );
}
