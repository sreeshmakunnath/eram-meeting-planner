import Link from "next/link";
import { PageHeader } from "@/components/ui";
import { importVendorRegistrations } from "@/lib/actions/vendor-import";
import { requireAdmin } from "@/lib/auth";
import { VendorImportForm } from "./import-form";

export default async function VendorImportPage() {
  await requireAdmin();
  return (
    <>
      <PageHeader
        title="Import vendor registrations"
        subtitle="Add or update vendor registrations from an Excel sheet."
        actions={
          <Link href="/reports/vendor-registrations" className="btn-secondary">
            Back to the report
          </Link>
        }
      />
      <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.4fr)]">
        <div className="card space-y-3 p-5 text-sm text-slate-600">
          <ol className="list-decimal space-y-1.5 pl-5">
            <li>
              <a href="/api/vendor-registrations/import-template" className="link">
                Download the template
              </a>{" "}
              and fill one row per registration.
            </li>
            <li>
              Upload it and click <b>Check file</b>. Nothing is saved; you see what would be added, updated or skipped, and why.
            </li>
            <li>
              Fix anything reported, then click <b>Import</b>.
            </li>
          </ol>
          <p>
            <b>Client</b> is required: its client code or exact name, for a client in your business units. A row with the same client and registration name as an existing one updates
            it: filled-in cells overwrite, empty cells keep the current value. The person assigned must be a member of the client&apos;s business unit; they get an in-app notice, no
            email.
          </p>
          <p>Portal passwords aren&apos;t imported. Add them on each registration, where they are stored encrypted.</p>
        </div>
        <VendorImportForm action={importVendorRegistrations} />
      </div>
    </>
  );
}
