import { PageHeader } from "@/components/ui";
import { importPlanner } from "@/lib/actions/import";
import { requireAdmin } from "@/lib/auth";
import { ImportForm } from "./import-form";

export default async function ImportPage() {
  await requireAdmin();
  return (
    <>
      <PageHeader title="Import Client Meeting Planner" subtitle="Upload the existing ERAM Holdings planner sheet (.xlsx)." />
      <div className="card mb-4 space-y-2 p-5 text-sm text-slate-600">
        <p>
          <a href="/api/meetings/import-template" className="link">
            Download the template
          </a>{" "}
          for a sheet with the right columns and dropdowns, or upload your existing planner sheet.
        </p>
        <p>
          The first sheet with a <b>Client / Company</b> header is read. Columns are matched by their names: Priority, Client / Company, Country / Location, Client Contact, ERAM
          Attendees, Meeting Type, Proposed Date, Proposed Time, Status, Meeting Objective / Agenda, Relevant Business Units, Presentation / Documents, Next Action, Action Owner,
          Follow-up Date, Notes.
        </p>
        <p>
          Clients are matched to the client master (also near-matches like &quot;Sabbic&quot; → SABIC) or added. ERAM attendees and action owners are matched to users by name.
          Rows already imported (same client and objective) are skipped, so it&apos;s safe to run again. No emails are sent during import.
        </p>
      </div>
      <ImportForm action={importPlanner} />
    </>
  );
}
