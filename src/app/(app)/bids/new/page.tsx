import Link from "next/link";
import { ActionForm, SubmitButton } from "@/components/action-form";
import { Field, PageHeader } from "@/components/ui";
import { allowedBuIds } from "@/lib/access";
import { createBid } from "@/lib/actions/bids";
import { requireUser } from "@/lib/auth";
import { BAND_LABEL, BID_TYPE_LABEL, BID_TYPES, PROBABILITY_BANDS, SECTORS } from "@/lib/bids";
import { todayRiyadh } from "@/lib/meetings";
import { activeBusinessUnits, activeUsers, bidClientOptions, projectOptions } from "@/lib/queries";
import { ClientUnitFields } from "../client-unit-fields";

/** Only what's needed to start a bid; the rest is filled in on the bid's own page. */
export default async function NewBidPage(props: { searchParams: Promise<{ client?: string }> }) {
  const sp = await props.searchParams;
  const me = await requireUser();
  const [clients, users, allBus] = await Promise.all([bidClientOptions(me), activeUsers(), activeBusinessUnits()]);
  const projects = await projectOptions(clients.map((c) => c.id));
  const allowed = allowedBuIds(me, allBus.map((b) => b.id));
  const bus = allBus.filter((b) => allowed.includes(b.id));

  return (
    <>
      <PageHeader title="New bid" subtitle="Start with the essentials. Dates, commercial terms and the rest go on the bid's page." />
      {bus.length === 0 ? (
        <p className="card p-6 text-sm text-slate-600">You aren&apos;t in any business unit yet, so you can&apos;t add bids. Ask an Admin to add you to one.</p>
      ) : (
        <ActionForm action={createBid} className="card p-6">
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
            <Field label="Title (project name) *">
              <input name="title" className="input" maxLength={200} required autoFocus />
            </Field>
            <ClientUnitFields clients={clients} units={bus.map((b) => ({ id: b.id, name: b.name }))} owners={users.map((u) => ({ id: u.id, name: u.fullName, buIds: u.buIds.map(Number) }))} defaultOwnerId={me.id} projects={projects} defaultClientId={clients.some((c) => c.id === Number(sp.client)) ? Number(sp.client) : null} />
            <Field label="Bid type *">
              <select name="bidType" className="input" defaultValue="BID" required>
                {BID_TYPES.map((t) => (
                  <option key={t} value={t}>
                    {BID_TYPE_LABEL[t]}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="Issue date *" hint="When the client issued the enquiry or tender.">
              <input type="date" name="issueDate" className="input" defaultValue={todayRiyadh()} required />
            </Field>
            <Field label="Closing date *" hint="Bid submission deadline.">
              <input type="date" name="closingDate" className="input" required />
            </Field>
            <Field label="Sector">
              <input name="sector" className="input" list="sectors" maxLength={100} />
              <datalist id="sectors">
                {SECTORS.map((s) => (
                  <option key={s} value={s} />
                ))}
              </datalist>
            </Field>
            <Field label="Quotation ref." hint="ERAM/Q/…">
              <input name="quotationRef" className="input" maxLength={100} />
            </Field>
            <Field label="Client tender no.">
              <input name="clientTenderNo" className="input" maxLength={100} />
            </Field>
            <Field label="Bid value (USD)" hint="Excluding VAT. Can be added later.">
              <input name="bidValue" className="input" inputMode="decimal" placeholder="0" />
            </Field>
            <Field label="Probability">
              <select name="probabilityBand" className="input" defaultValue="">
                <option value="">Not set</option>
                {PROBABILITY_BANDS.map((p) => (
                  <option key={p} value={p}>
                    {BAND_LABEL[p]}
                  </option>
                ))}
              </select>
            </Field>
          </div>
          <div className="mt-6 flex gap-2">
            <SubmitButton>Create bid</SubmitButton>
            <Link href="/bids" className="btn-secondary">
              Cancel
            </Link>
          </div>
        </ActionForm>
      )}
    </>
  );
}
