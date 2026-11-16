import { and, asc, eq } from "drizzle-orm";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Logo } from "@/components/logo";
import { PrintButton } from "@/components/print-button";
import { db, schema } from "@/db";
import { bidVisibleTo } from "@/lib/access";
import { requireUser } from "@/lib/auth";
import { BAND_LABEL, BID_STAGE_LABEL, BID_TYPE_LABEL, isOpenStage, SUBMISSION_MODE_LABEL, TENDER_CATEGORY_LABEL, usd, weighted } from "@/lib/bids";
import { fmtPlainDate, todayRiyadh } from "@/lib/meetings";

export const dynamic = "force-dynamic";

/**
 * Printable bid summary. The default "client copy" is for tender submissions and leaves out everything internal
 * (probability, weighted value, profit per head, risks, notes, documents); ?internal=1 prints the full record.
 * Same visibility as the bid itself: only its business unit (and Super Admins).
 */
export default async function PrintBid(props: { params: Promise<{ id: string }>; searchParams: Promise<{ internal?: string }> }) {
  const [{ id: idStr }, sp] = await Promise.all([props.params, props.searchParams]);
  const me = await requireUser();
  const id = Number(idStr);
  if (!Number.isInteger(id)) notFound();
  const [bid] = await db
    .select()
    .from(schema.bids)
    .where(and(eq(schema.bids.id, id), bidVisibleTo(me)));
  if (!bid) notFound();
  const internal = sp.internal === "1";

  const one = async <T,>(q: Promise<T[]>) => (await q)[0];
  const [client, endClient, contact, unit, owner, items, documents] = await Promise.all([
    one(
      db
        .select({ name: schema.clients.name, code: schema.clients.clientCode, project: schema.clientProjects.name })
        .from(schema.clients)
        .leftJoin(schema.clientProjects, eq(schema.clientProjects.id, bid.projectId ?? 0))
        .where(eq(schema.clients.id, bid.clientId)),
    ),
    bid.endClientId ? one(db.select({ name: schema.clients.name }).from(schema.clients).where(eq(schema.clients.id, bid.endClientId))) : undefined,
    bid.contactId
      ? one(db.select({ name: schema.clientContacts.name, designation: schema.clientContacts.designation }).from(schema.clientContacts).where(eq(schema.clientContacts.id, bid.contactId)))
      : undefined,
    one(db.select({ name: schema.businessUnits.name }).from(schema.businessUnits).where(eq(schema.businessUnits.id, bid.businessUnitId))),
    bid.ownerId ? one(db.select({ name: schema.users.fullName, email: schema.users.email }).from(schema.users).where(eq(schema.users.id, bid.ownerId))) : undefined,
    db.select().from(schema.bidItems).where(eq(schema.bidItems.bidId, id)).orderBy(asc(schema.bidItems.position)),
    internal ? db.select({ name: schema.bidDocuments.name, url: schema.bidDocuments.url }).from(schema.bidDocuments).where(eq(schema.bidDocuments.bidId, id)) : Promise.resolve([]),
  ]);

  const months = (n: number | null) => (n ? `${n} month${n === 1 ? "" : "s"}` : null);
  const lineTotal = (i: (typeof items)[number]) => (i.unitPrice == null ? null : i.unitPrice * (i.quantity ?? 1));
  const itemsTotal = items.reduce((a, i) => a + (lineTotal(i) ?? 0), 0);
  type Row = [string, React.ReactNode];
  const sections: [string, Row[]][] = [
    [
      "Tender",
      [
        ["Client", client?.name],
        ["End client", endClient?.name],
        ["Project", client?.project],
        ["Bid / package", bid.title],
        ["Client tender no.", bid.clientTenderNo],
        ["Client reference", bid.clientRefNo],
        ["ERAM quotation ref.", bid.quotationRef],
        ["Bid type", BID_TYPE_LABEL[bid.bidType]],
        ["Client contact", contact ? contact.name + (contact.designation ? `, ${contact.designation}` : "") : null],
        ["ERAM contact", owner ? `${owner.name} (${owner.email})` : null],
      ],
    ],
    [
      "Scope and location",
      [
        ["Scope of work", bid.scope],
        ["Location", [bid.site, bid.location, bid.country].filter(Boolean).join(", ")],
        ["Manpower", bid.manpowerEstimate ? `${bid.manpowerEstimate} personnel` : null],
        ["Duration", [months(bid.durationMonths), bid.optionMonths ? `+ ${months(bid.optionMonths)} option` : null].filter(Boolean).join(" ")],
        ["Expected start", bid.expectedStartDate ? fmtPlainDate(bid.expectedStartDate) : null],
      ],
    ],
    [
      "Commercial (USD, excluding VAT)",
      [
        ["Bid value", bid.bidValue ? usd(bid.bidValue, 2) : null],
        ["Monthly billing", bid.monthlyBilling ? usd(bid.monthlyBilling, 2) : null],
        ["Payment terms", bid.paymentTerms],
        ["Invoicing schedule", bid.invoicingSchedule],
        ["Retention", bid.retentionPct != null ? `${bid.retentionPct}%` : null],
        ["Advance payment", bid.advancePayment],
        ["Insurance", bid.insuranceTerms],
        ["Penalty clause", bid.penaltyTerms],
      ],
    ],
    [
      "Dates",
      [
        ["Closing date", fmtPlainDate(bid.closingDate)],
        ["Submitted", bid.submittedDate ? fmtPlainDate(bid.submittedDate) : null],
        ["Submission mode", bid.submissionMode ? SUBMISSION_MODE_LABEL[bid.submissionMode] : null],
      ],
    ],
    ...(internal
      ? ([
          [
            "Internal",
            [
              ["Business unit", unit?.name],
              ["Client code", client?.code],
              ["Stage", BID_STAGE_LABEL[bid.stage] + (bid.closedReason ? ` — ${bid.closedReason}` : "")],
              ["Probability", bid.probabilityBand ? BAND_LABEL[bid.probabilityBand] : null],
              ["Weighted value", isOpenStage(bid.stage) && bid.bidValue && bid.probabilityBand ? usd(weighted(bid.bidValue, bid.probabilityBand)) : null],
              ["Profit per head", bid.profitPerHead ? usd(bid.profitPerHead, 2) : null],
              ["Sector / category", [bid.sector, bid.tenderCategory ? TENDER_CATEGORY_LABEL[bid.tenderCategory] : null].filter(Boolean).join(" · ")],
              ["Issue date", fmtPlainDate(bid.issueDate)],
              ["Clarification deadline", bid.clarificationDeadline ? fmtPlainDate(bid.clarificationDeadline) : null],
              ["Expected award", bid.expectedAwardDate ? fmtPlainDate(bid.expectedAwardDate) : null],
              ["Risk factors", bid.risks],
              ["Notes", bid.notes],
              ["Documents", documents.length ? documents.map((d) => `${d.name}: ${d.url}`).join("\n") : null],
            ],
          ],
        ] as [string, Row[]][])
      : []),
  ];

  return (
    <div className="mx-auto max-w-[210mm] bg-white p-8 text-[13px] print:p-0">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3 print:hidden">
        <Link href={`/bids/${id}`} className="link text-sm">
          ← Back to the bid
        </Link>
        <div className="flex items-center gap-2">
          <div className="flex gap-1 rounded-md bg-slate-100 p-1 text-sm">
            <Link href={`/bids-print/${id}`} className={`rounded px-3 py-1 ${!internal ? "bg-white shadow-sm" : "text-slate-600"}`}>
              Client copy
            </Link>
            <Link href={`/bids-print/${id}?internal=1`} className={`rounded px-3 py-1 ${internal ? "bg-white shadow-sm" : "text-slate-600"}`}>
              Internal
            </Link>
          </div>
          <PrintButton />
        </div>
      </div>
      <p className="mb-3 text-xs text-slate-500 print:hidden">
        {internal ? "Internal copy: includes probability, profit, risks and notes. Not for the client." : "Client copy: leaves out probability, profit per head, risks, notes and documents."}
      </p>
      <div className="mb-3 flex items-end justify-between">
        <Logo on="light" className="h-12" />
        <div className="text-right text-[11px] text-slate-500">
          {bid.quotationRef && <div>Ref. {bid.quotationRef}</div>}
          <div>Printed {fmtPlainDate(todayRiyadh())}</div>
        </div>
      </div>
      <div className="bg-navy px-4 py-3 text-center text-lg font-bold tracking-wide text-white">
        ERAM HOLDINGS | {internal ? "BID SUMMARY — INTERNAL" : "TENDER SUBMISSION SUMMARY"}
      </div>
      {sections.map(([title, rows]) => {
        const filled = rows.filter(([, v]) => v !== null && v !== undefined && v !== "");
        if (!filled.length) return null;
        return (
          <table key={title} className="w-full border-collapse break-inside-avoid">
            <tbody>
              <tr>
                <th colSpan={2} className="border border-slate-300 bg-navy-50 px-3 py-1.5 text-left text-[12px] font-bold uppercase tracking-wide text-navy">
                  {title}
                </th>
              </tr>
              {filled.map(([k, v]) => (
                <tr key={k}>
                  <th className="w-1/3 border border-slate-300 px-3 py-2 text-left align-top font-semibold text-slate-700">{k}</th>
                  <td className="whitespace-pre-wrap border border-slate-300 px-3 py-2 align-top">{v}</td>
                </tr>
              ))}
            </tbody>
          </table>
        );
      })}
      {items.length > 0 && (
        <table className="mt-4 w-full border-collapse">
          <thead>
            <tr>
              <th colSpan={6} className="border border-slate-300 bg-navy-50 px-3 py-1.5 text-left text-[12px] font-bold uppercase tracking-wide text-navy">
                Quoted items (USD)
              </th>
            </tr>
            <tr className="text-left text-[12px]">
              <th className="w-8 border border-slate-300 px-2 py-1.5">#</th>
              <th className="border border-slate-300 px-2 py-1.5">Item / service</th>
              <th className="border border-slate-300 px-2 py-1.5">Unit</th>
              <th className="border border-slate-300 px-2 py-1.5 text-right">Qty</th>
              <th className="border border-slate-300 px-2 py-1.5 text-right">Unit price</th>
              <th className="border border-slate-300 px-2 py-1.5 text-right">Total</th>
            </tr>
          </thead>
          <tbody>
            {items.map((i, n) => {
              const t = lineTotal(i);
              return (
                <tr key={i.id} className="break-inside-avoid">
                  <td className="border border-slate-300 px-2 py-1.5 text-slate-500">{n + 1}</td>
                  <td className="border border-slate-300 px-2 py-1.5">{i.description}</td>
                  <td className="border border-slate-300 px-2 py-1.5">{i.unit ?? ""}</td>
                  <td className="border border-slate-300 px-2 py-1.5 text-right tabular-nums">{i.quantity ?? ""}</td>
                  <td className="border border-slate-300 px-2 py-1.5 text-right tabular-nums">{i.unitPrice != null ? usd(i.unitPrice, 2) : ""}</td>
                  <td className="border border-slate-300 px-2 py-1.5 text-right tabular-nums">{t != null ? usd(t, 2) : ""}</td>
                </tr>
              );
            })}
            <tr>
              <td colSpan={5} className="border border-slate-300 px-2 py-1.5 text-right font-semibold">
                Total
              </td>
              <td className="border border-slate-300 px-2 py-1.5 text-right font-semibold tabular-nums">{usd(itemsTotal, 2)}</td>
            </tr>
          </tbody>
        </table>
      )}
      <p className="mt-3 text-[11px] text-slate-500">All amounts in US dollars, excluding VAT.</p>
    </div>
  );
}
