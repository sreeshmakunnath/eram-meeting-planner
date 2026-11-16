import { and, asc, desc, eq } from "drizzle-orm";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Badge, fmtDateTime, labelize, Notice, PageHeader, Tabs } from "@/components/ui";
import { db, schema } from "@/db";
import { allowedBuIds, bidVisibleTo, canControlBid, canEditBid, contactVisibleTo } from "@/lib/access";
import { addBidDocument, deleteBid, removeBidDocument, addBidTeamMember, removeBidTeamMember } from "@/lib/actions/bids";
import { ActionForm, SubmitButton } from "@/components/action-form";
import { requireUser } from "@/lib/auth";
import { bidHistory, MIN_HISTORY } from "@/lib/bid-history";
import { BAND_LABEL, BID_STAGE_LABEL, BID_STAGE_TONE, BID_TYPE_LABEL, isOpenStage, usd, weighted } from "@/lib/bids";
import { fmtPlainDate, todayRiyadh } from "@/lib/meetings";
import { activeBusinessUnits, activeUsers, bidClientOptions, clientOptions, projectOptions } from "@/lib/queries";
import { CommercialForm, OverviewForm, StageForm } from "./bid-forms";

const TABS = ["overview", "commercial", "documents", "activity"] as const;

export default async function BidPage(props: { params: Promise<{ id: string }>; searchParams: Promise<{ tab?: string; msg?: string }> }) {
  const [{ id: idStr }, sp] = await Promise.all([props.params, props.searchParams]);
  const id = Number(idStr);
  const me = await requireUser();
  if (!Number.isInteger(id)) notFound();
  const [bid] = await db
    .select()
    .from(schema.bids)
    .where(and(eq(schema.bids.id, id), bidVisibleTo(me)));
  if (!bid) notFound();
  const tab = TABS.includes(sp.tab as (typeof TABS)[number]) ? sp.tab! : "overview";

  const [canEdit, control, team, [client], [unit], [owner], history, clients, endClients, contacts, users, allBus, activity, items, documents] = await Promise.all([
    canEditBid(me, bid),
    canControlBid(me, bid),
    db
      .select({ id: schema.users.id, name: schema.users.fullName, status: schema.users.status })
      .from(schema.bidTeam)
      .innerJoin(schema.users, eq(schema.bidTeam.userId, schema.users.id))
      .where(eq(schema.bidTeam.bidId, id))
      .orderBy(asc(schema.users.fullName)),
    db
      .select({ name: schema.clients.name, code: schema.clients.clientCode, project: schema.clientProjects.name })
      .from(schema.clients)
      .leftJoin(schema.clientProjects, eq(schema.clientProjects.id, bid.projectId ?? 0))
      .where(eq(schema.clients.id, bid.clientId)),
    db.select({ name: schema.businessUnits.name }).from(schema.businessUnits).where(eq(schema.businessUnits.id, bid.businessUnitId)),
    bid.ownerId ? db.select({ name: schema.users.fullName }).from(schema.users).where(eq(schema.users.id, bid.ownerId)) : Promise.resolve([]),
    bidHistory(me, bid),
    bidClientOptions(me, bid.clientId),
    clientOptions(me, bid.endClientId),
    db
      .select({ id: schema.clientContacts.id, name: schema.clientContacts.name })
      .from(schema.clientContacts)
      .where(and(eq(schema.clientContacts.clientId, bid.clientId), contactVisibleTo(me)))
      .orderBy(asc(schema.clientContacts.name)),
    activeUsers(),
    activeBusinessUnits(),
    tab === "activity"
      ? db
          .select({ id: schema.auditLogs.id, at: schema.auditLogs.createdAt, action: schema.auditLogs.action, details: schema.auditLogs.details, user: schema.users.fullName })
          .from(schema.auditLogs)
          .leftJoin(schema.users, eq(schema.auditLogs.userId, schema.users.id))
          .where(and(eq(schema.auditLogs.entity, "bid"), eq(schema.auditLogs.entityId, id)))
          .orderBy(desc(schema.auditLogs.createdAt))
          .limit(100)
      : Promise.resolve([]),
    tab === "commercial"
      ? db
          .select({ description: schema.bidItems.description, unit: schema.bidItems.unit, quantity: schema.bidItems.quantity, unitPrice: schema.bidItems.unitPrice })
          .from(schema.bidItems)
          .where(eq(schema.bidItems.bidId, id))
          .orderBy(asc(schema.bidItems.position))
      : Promise.resolve([]),
    db
      .select({ id: schema.bidDocuments.id, name: schema.bidDocuments.name, url: schema.bidDocuments.url, at: schema.bidDocuments.createdAt, by: schema.users.fullName })
      .from(schema.bidDocuments)
      .leftJoin(schema.users, eq(schema.bidDocuments.addedById, schema.users.id))
      .where(eq(schema.bidDocuments.bidId, id))
      .orderBy(asc(schema.bidDocuments.createdAt)),
  ]);
  const projects = tab === "overview" ? await projectOptions(clients.map((c) => c.id)) : [];
  // Units the bid can move to: the person's own, plus the one it is in
  const allowed = allowedBuIds(me, allBus.map((b) => b.id));
  const units = allBus.filter((b) => allowed.includes(b.id) || b.id === bid.businessUnitId).map((b) => ({ id: b.id, name: b.name }));

  const today = todayRiyadh();
  const open = isOpenStage(bid.stage);
  const left = Math.round((Date.parse(bid.closingDate) - Date.parse(today)) / 86400_000);
  const base = `/bids/${id}`;

  return (
    <>
      <PageHeader
        title={bid.title}
        subtitle={[client?.name + (client?.code ? ` (${client.code})` : ""), client?.project ? `Project: ${client.project}` : null, unit?.name, owner?.name ? `Owner: ${owner.name}` : "No owner", BID_TYPE_LABEL[bid.bidType]].filter(Boolean).join(" · ")}
        actions={
          <>
            <Link href="/bids" className="btn-secondary">
              All bids
            </Link>
            <Link href={`/bids-print/${id}`} className="btn-secondary" target="_blank">
              Print
            </Link>
            {control && (
              <details className="relative">
                <summary className="btn-secondary cursor-pointer list-none text-red-700">Delete…</summary>
                <form action={deleteBid.bind(null, id)} className="absolute right-0 z-10 mt-1 w-64 rounded-md border border-slate-200 bg-white p-3 text-sm shadow-lg">
                  <p className="mb-2 text-slate-600">Delete this bid and its details? This can&apos;t be undone.</p>
                  <button className="btn-danger w-full">Delete bid</button>
                </form>
              </details>
            )}
          </>
        }
      />
      {sp.msg === "denied" && <Notice tone="error">Only the bid owner, the owner&apos;s managers and the unit&apos;s Admins can do that.</Notice>}

      <div className="mb-4 grid grid-cols-2 gap-3 md:grid-cols-5">
        <div className="card p-4">
          <div className="text-xs font-semibold uppercase tracking-wide text-slate-500">Stage</div>
          <div className="mt-1.5">
            <Badge tone={BID_STAGE_TONE[bid.stage]}>{BID_STAGE_LABEL[bid.stage]}</Badge>
          </div>
          <div className="mt-1 text-xs text-slate-500">{bid.closedAt ? `Closed ${fmtDateTime(bid.closedAt)}` : bid.submittedDate ? `Submitted ${fmtPlainDate(bid.submittedDate)}` : "Not submitted yet"}</div>
        </div>
        <div className="card p-4">
          <div className="text-xs font-semibold uppercase tracking-wide text-slate-500">Bid value</div>
          <div className="mt-1 text-2xl font-bold tabular-nums text-navy">{usd(bid.bidValue)}</div>
          <div className="text-xs text-slate-500">USD, excluding VAT</div>
        </div>
        <div className="card p-4">
          <div className="text-xs font-semibold uppercase tracking-wide text-slate-500">Probability</div>
          <div className="mt-1 text-2xl font-bold text-navy">{bid.probabilityBand ? BAND_LABEL[bid.probabilityBand] : <span className="text-slate-400">Not set</span>}</div>
          <div className="text-xs text-slate-500" title={history.pct !== null ? `Won ÷ (won + lost) among ${history.n} closed bids: ${history.basis}` : undefined}>
            {history.pct !== null ? (
              <>
                History: <b className="text-slate-700">{history.pct}%</b> · {history.n} similar ({history.basis})
              </>
            ) : (
              `History: not enough yet (${history.closed} of ${MIN_HISTORY} closed bids)`
            )}
          </div>
        </div>
        <div className="card p-4">
          <div className="text-xs font-semibold uppercase tracking-wide text-slate-500">Weighted value</div>
          <div className="mt-1 text-2xl font-bold tabular-nums text-navy">{open && bid.bidValue && bid.probabilityBand ? usd(weighted(bid.bidValue, bid.probabilityBand)) : "—"}</div>
          <div className="text-xs text-slate-500">Value × middle of the band</div>
        </div>
        <div className="card p-4">
          <div className="text-xs font-semibold uppercase tracking-wide text-slate-500">Closing</div>
          <div className="mt-1 text-lg font-bold text-navy">{fmtPlainDate(bid.closingDate)}</div>
          {open ? (
            <div className={`text-xs ${left < 0 ? "font-semibold text-red-600" : left <= 7 ? "font-semibold text-amber-700" : "text-slate-500"}`}>
              {left < 0 ? `${-left} day${left === -1 ? "" : "s"} past` : left === 0 ? "Closes today" : `${left} day${left === 1 ? "" : "s"} left`}
            </div>
          ) : (
            <div className="text-xs text-slate-500">Bid closed</div>
          )}
        </div>
      </div>

      <div className="grid gap-4 xl:grid-cols-12">
        <div className="xl:col-span-9">
          <Tabs
            active={tab === "overview" ? base : `${base}?tab=${tab}`}
            items={[
              { href: base, label: "Overview" },
              { href: `${base}?tab=commercial`, label: "Commercial" },
              { href: `${base}?tab=documents`, label: `Documents${documents.length ? ` (${documents.length})` : ""}` },
              { href: `${base}?tab=activity`, label: "Activity" },
            ]}
          />
          {!canEdit && <p className="mb-3 text-xs text-slate-500">Read only: the bid owner, the bid team, the owner&apos;s managers and the unit&apos;s Admins can edit it.</p>}
          {canEdit && !control && <p className="mb-3 text-xs text-slate-500">You&apos;re on the bid team: you can edit the details, but the client, owner and project stay with the owner.</p>}
          {tab === "overview" && (
            <OverviewForm
              bid={bid}
              canEdit={canEdit}
              control={control}
              clients={clients}
              endClients={endClients}
              projects={projects}
              contacts={contacts}
              users={users.map((u) => ({ id: u.id, name: u.fullName, buIds: u.buIds.map(Number) }))}
              units={units}
            />
          )}
          {tab === "commercial" && <CommercialForm bid={bid} canEdit={canEdit} items={items} />}
          {tab === "documents" && (
            <div className="grid gap-4 lg:grid-cols-3">
              <section className="card lg:col-span-2">
                {documents.length === 0 ? (
                  <p className="p-4 text-sm text-slate-500">No documents yet.{canEdit ? " Add the SharePoint link of each tender document, costing sheet or submission." : ""}</p>
                ) : (
                  <ul className="divide-y divide-slate-100 text-sm">
                    {documents.map((d) => (
                      <li key={d.id} className="flex items-center justify-between gap-3 px-4 py-2.5">
                        <span className="min-w-0">
                          <a href={d.url} target="_blank" rel="noopener noreferrer" className="link block truncate font-medium">
                            {d.name} ↗
                          </a>
                          <span className="text-xs text-slate-500">
                            Added {d.by ? `by ${d.by} ` : ""}on {fmtDateTime(d.at)}
                          </span>
                        </span>
                        {canEdit && (
                          <form action={removeBidDocument.bind(null, id, d.id)}>
                            <button className="rounded px-2 py-1 text-xs text-slate-500 hover:bg-red-50 hover:text-red-700">Remove</button>
                          </form>
                        )}
                      </li>
                    ))}
                  </ul>
                )}
              </section>
              {canEdit && (
                <ActionForm action={addBidDocument.bind(null, id)} className="card space-y-3 p-4">
                  <h3 className="font-semibold text-navy">Add a document</h3>
                  <label className="block">
                    <span className="label">Name *</span>
                    <input name="name" className="input" maxLength={200} required placeholder="e.g. Technical proposal rev. 2" />
                  </label>
                  <label className="block">
                    <span className="label">SharePoint link *</span>
                    <input name="url" type="url" className="input" required placeholder="https://…sharepoint.com/…" />
                  </label>
                  <SubmitButton>Add document</SubmitButton>
                </ActionForm>
              )}
            </div>
          )}
          {tab === "activity" && (
            <section className="card">
              {activity.length === 0 ? (
                <p className="p-4 text-sm text-slate-500">No activity yet.</p>
              ) : (
                <ul className="max-h-[32rem] divide-y divide-slate-100 overflow-y-auto text-sm">
                  {activity.map((a) => {
                    const d = (a.details ?? {}) as { from?: string; to?: string; reason?: string; changed?: string[]; member?: string };
                    return (
                      <li key={a.id} className="flex items-start justify-between gap-4 px-4 py-2.5">
                        <span>
                          <b>{a.user ?? "System"}</b> · {labelize(a.action.replace(/^BID_/, ""))}
                          {d.from && d.to && (
                            <span className="text-slate-600">
                              : {d.from} → {d.to}
                            </span>
                          )}
                          {d.member && <span className="text-slate-600">: {d.member}</span>}
                          {d.reason && <span className="block text-xs text-slate-500">Reason: {d.reason}</span>}
                          {d.changed?.length ? <span className="block text-xs text-slate-500">Changed: {d.changed.map((k) => labelize(k.replace(/([A-Z])/g, "_$1"))).join(", ")}</span> : null}
                        </span>
                        <span className="shrink-0 text-xs text-slate-500">{fmtDateTime(a.at)}</span>
                      </li>
                    );
                  })}
                </ul>
              )}
            </section>
          )}
        </div>
        <aside className="space-y-4 xl:col-span-3 xl:pt-12">
          <StageForm bid={bid} canEdit={canEdit} />
          <section className="card p-4 text-sm">
            <h3 className="mb-2 font-semibold text-navy">Bid team</h3>
            <ul className="divide-y divide-slate-100">
              <li className="flex items-center justify-between gap-2 py-1.5">
                <span className="truncate font-medium text-slate-700">{owner?.name ?? "No owner"}</span>
                <span className="text-xs text-slate-500">Owner</span>
              </li>
              {team.map((t) => (
                <li key={t.id} className="flex items-center justify-between gap-2 py-1.5">
                  <span className="truncate text-slate-700">
                    {t.name}
                    {t.status !== "ACTIVE" && <span className="ml-1 text-xs text-slate-400">(inactive)</span>}
                  </span>
                  {control ? (
                    <form action={removeBidTeamMember.bind(null, id, t.id)}>
                      <button className="rounded px-2 py-0.5 text-xs text-slate-500 hover:bg-red-50 hover:text-red-700">Remove</button>
                    </form>
                  ) : (
                    <span className="text-xs text-slate-500">Team</span>
                  )}
                </li>
              ))}
            </ul>
            {control && (
              <ActionForm action={addBidTeamMember.bind(null, id)} className="mt-3 space-y-2 border-t border-slate-100 pt-3">
                <select name="userId" className="input" required defaultValue="">
                  <option value="">Add someone…</option>
                  {users
                    .filter((u) => u.id !== bid.ownerId && !team.some((t) => t.id === u.id) && u.buIds.map(Number).includes(bid.businessUnitId))
                    .map((u) => (
                      <option key={u.id} value={u.id}>
                        {u.fullName}
                      </option>
                    ))}
                </select>
                <SubmitButton variant="secondary">Add to team</SubmitButton>
              </ActionForm>
            )}
            <p className="mt-2 text-xs text-slate-500">Team members see and edit this bid. Only people in {unit?.name ?? "the bid's unit"} can be added; their managers don&apos;t get access.</p>
          </section>
          {bid.closedReason && !open && (
            <section className="card p-4 text-sm">
              <h3 className="mb-1 font-semibold text-navy">Reason</h3>
              <p className="whitespace-pre-line text-slate-700">{bid.closedReason}</p>
            </section>
          )}
        </aside>
      </div>
    </>
  );
}
