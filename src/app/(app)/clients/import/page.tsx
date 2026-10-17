import Link from "next/link";
import { PageHeader } from "@/components/ui";
import { importClients } from "@/lib/actions/client-import";
import { requireAdmin } from "@/lib/auth";
import { ClientImportForm } from "./import-form";

export default async function ClientImportPage() {
  await requireAdmin();
  return (
    <>
      <PageHeader
        title="Import clients"
        subtitle="Add or update clients and their contacts from an Excel sheet."
        actions={
          <Link href="/clients" className="btn-secondary">
            Back to clients
          </Link>
        }
      />
      <div className="card mb-4 space-y-3 p-5 text-sm text-slate-600">
        <ol className="list-decimal space-y-1.5 pl-5">
          <li>
            <a href="/api/clients/import-template" className="link">
              Download the template
            </a>{" "}
            and fill one row per contact. A client with several contacts takes several rows with the same client name. The client export (CSV, saved as .xlsx) works too.
          </li>
          <li>
            Upload it and click <b>Check file</b>. Nothing is saved; you see what would be added, updated or skipped, and why.
          </li>
          <li>
            Fix anything reported, then click <b>Import</b>.
          </li>
        </ol>
        <p>
          <b>Client</b> and <b>Country</b> are required for new clients. Clients that already exist (same name) are updated: filled-in cells overwrite, empty cells keep the current
          value, and contacts and business units are only added. Names close to an existing client, like &quot;Sabbic&quot; and SABIC, are held back as possible duplicates. No
          emails are sent.
        </p>
      </div>
      <ClientImportForm action={importClients} />
    </>
  );
}
