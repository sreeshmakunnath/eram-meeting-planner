import { and, asc, desc, eq, ne } from "drizzle-orm";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ActionForm, SubmitButton } from "@/components/action-form";
import { Badge, Empty, Field, fmtDateTime, labelize, Notice, PageHeader, statusTone, Tabs } from "@/components/ui";
import { db, schema } from "@/db";
import { addContact, approveClient, deleteContact, mergeClient, setPrimaryContact } from "@/lib/actions/clients";
import { requireUser } from "@/lib/auth";
import { BD_STAGE_LABELS } from "@/lib/queries";
import { listMeetings } from "@/lib/meeting-queries";
import { fmtDay, fmtPlainDate, fmtTime, STATUS_LABEL, STATUS_TONE, TYPE_LABEL } from "@/lib/meetings";
import { isSimilar } from "@/lib/similar";

const messages: Record<string, { tone: "ok" | "error"; text: string }> = {
  saved: { tone: "ok", text: "Client saved." },
  approved: { tone: "ok", text: "Client approved and now available in dropdowns." },
  merged: { tone: "ok", text: "Duplicate merged into this client; its contacts were moved here." },
  mergefail: { tone: "error", text: "Pick a different client to merge into." },
  denied: { tone: "error", text: "Only an Admin or the account owner can do that." },
};

export default async function ClientPage({ params, searchParams }: { params: { id: string }; searchParams: { tab?: string; msg?: string } }) {
  const me = await requireUser();
  const id = Number(params.id);
  const client = Number.isInteger(id)
    ? await db.query.clients.findFirst({
        where: eq(schema.clients.id, id),
        with: {
          accountOwner: { columns: { fullName: true } },
          accountGroup: { columns: { id: true, name: true } },
          createdBy: { columns: { fullName: true } },
          contacts: { orderBy: (c, { desc, asc }) => [desc(c.isPrimary), asc(c.name)] },
          businessUnits: { with: { businessUnit: { columns: { name: true } } } },
        },
      })
    : undefined;
  if (!client) notFound();
  const editable = me.role === "ADMIN" || client.accountOwnerId === me.id;
  const tab = searchParams.tab ?? "contacts";
  const msg = searchParams.msg ? messages[searchParams.msg] : undefined;
  const base = `/clients/${id}`;

  const allClients =
    client.status === "PENDING_REVIEW" && me.role === "ADMIN"
      ? await db
          .select({ id: schema.clients.id, name: schema.clients.name })
          .from(schema.clients)
          .where(ne(schema.clients.id, id))
          .orderBy(asc(schema.clients.name))
      : [];
  const meetings = tab === "meetings" ? await listMeetings(me, { client: String(id), status: "ALL" }) : [];
  const possibleDuplicates = allClients.filter((c) => isSimilar(c.name, client.name));
  const activity =
    tab === "activity"
      ? await db
          .select({ id: schema.auditLogs.id, at: schema.auditLogs.createdAt, action: schema.auditLogs.action, details: schema.auditLogs.details, user: schema.users.fullName })
          .from(schema.auditLogs)
          .leftJoin(schema.users, eq(schema.auditLogs.userId, schema.users.id))
          .where(and(eq(schema.auditLogs.entity, "client"), eq(schema.auditLogs.entityId, id)))
          .orderBy(desc(schema.auditLogs.createdAt))
          .limit(100)
      : [];

  return (
    <>
      <PageHeader
        title={client.name}
        subtitle={[labelize(client.type), [client.city, client.country].filter(Boolean).join(", "), client.industry].filter(Boolean).join(" · ")}
        actions={
          <>
            <Badge tone={statusTone(client.status)}>{labelize(client.status)}</Badge>
            <Link href={`/meetings/new?client=${id}`} className="btn-secondary">
              New meeting
            </Link>
            {editable && (
              <Link href={`${base}/edit`} className="btn-primary">
                Edit client
              </Link>
            )}
          </>
        }
      />
      {msg && <Notice tone={msg.tone}>{msg.text}</Notice>}

      {client.status === "PENDING_REVIEW" && me.role === "ADMIN" && (
        <div className="card mb-6 border-amber-200 bg-amber-50/50 p-4">
          <div className="mb-3 text-sm text-amber-900">
            Added by {client.createdBy?.fullName ?? "a user"} and waiting for review.
            {possibleDuplicates.length > 0 && <> Possible duplicates: {possibleDuplicates.map((d) => d.name).join(", ")}.</>}
          </div>
          <div className="flex flex-wrap items-center gap-3">
            <form action={approveClient.bind(null, id)}>
              <button className="btn-primary">Approve</button>
            </form>
            <form action={mergeClient.bind(null, id)} className="flex items-center gap-2">
              <select name="targetId" className="input" defaultValue={possibleDuplicates[0]?.id ?? ""} required>
                <option value="">Merge into…</option>
                {allClients.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </select>
              <button className="btn-secondary">Merge</button>
            </form>
          </div>
        </div>
      )}

      <div className="grid gap-6 lg:grid-cols-3">
        <section className="card p-4 text-sm lg:order-2">
          <dl className="space-y-3">
            {[
              ["Short code", client.shortCode],
              ["BD stage", client.bdStage ? BD_STAGE_LABELS[client.bdStage] : null],
              ["Account owner", client.accountOwner?.fullName],
              ["Business units", client.businessUnits.map((b) => b.businessUnit.name).join(", ")],
            ].map(([k, v]) => (
              <div key={k as string}>
                <dt className="text-xs uppercase tracking-wide text-slate-500">{k}</dt>
                <dd>{v || "—"}</dd>
              </div>
            ))}
            <div>
              <dt className="text-xs uppercase tracking-wide text-slate-500">Account group</dt>
              <dd>
                {client.accountGroup ? (
                  <Link href={`/groups/${client.accountGroup.id}`} className="link">
                    {client.accountGroup.name}
                  </Link>
                ) : (
                  "—"
                )}
              </dd>
            </div>
            <div>
              <dt className="text-xs uppercase tracking-wide text-slate-500">Website</dt>
              <dd>
                {client.website ? (
                  <a href={client.website} className="link" target="_blank" rel="noreferrer">
                    {client.website.replace(/^https?:\/\//, "")}
                  </a>
                ) : (
                  "—"
                )}
              </dd>
            </div>
            {client.notes && (
              <div>
                <dt className="text-xs uppercase tracking-wide text-slate-500">Notes</dt>
                <dd className="whitespace-pre-wrap">{client.notes}</dd>
              </div>
            )}
          </dl>
        </section>

        <div className="lg:order-1 lg:col-span-2">
          <Tabs
            active={`${base}?tab=${tab}`}
            items={[
              { href: `${base}?tab=contacts`, label: `Contacts (${client.contacts.length})` },
              { href: `${base}?tab=meetings`, label: "Meetings" },
              { href: `${base}?tab=tasks`, label: "Open tasks" },
              { href: `${base}?tab=activity`, label: "Activity" },
            ]}
          />

          {tab === "contacts" && (
            <div className="space-y-6">
              <div className="card overflow-x-auto">
                {client.contacts.length === 0 ? (
                  <Empty>No contacts yet. Add the first one below.</Empty>
                ) : (
                  <table className="table">
                    <thead>
                      <tr>
                        <th>Name</th>
                        <th>Email</th>
                        <th>Phone</th>
                        <th />
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {client.contacts.map((c) => (
                        <tr key={c.id}>
                          <td>
                            {c.name} {c.isPrimary && <Badge tone="blue">Primary</Badge>}
                            {c.designation && <div className="text-xs text-slate-500">{c.designation}</div>}
                          </td>
                          <td>{c.email ? <a href={`mailto:${c.email}`} className="link">{c.email}</a> : "—"}</td>
                          <td>{c.phone ?? "—"}</td>
                          <td className="whitespace-nowrap text-right">
                            {!c.isPrimary && (
                              <form action={setPrimaryContact.bind(null, id, c.id)} className="inline">
                                <button className="text-xs text-brand hover:underline">Make primary</button>
                              </form>
                            )}
                            {editable && (
                              <form action={deleteContact.bind(null, id, c.id)} className="ml-3 inline">
                                <button className="text-xs text-red-600 hover:underline">Remove</button>
                              </form>
                            )}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                )}
              </div>
              <ActionForm action={addContact.bind(null, id)} className="card p-4">
                <h3 className="mb-3 font-semibold text-navy">Add contact</h3>
                <div className="grid gap-3 md:grid-cols-2">
                  <Field label="Name *">
                    <input name="name" className="input" maxLength={100} required />
                  </Field>
                  <Field label="Designation">
                    <input name="designation" className="input" maxLength={100} />
                  </Field>
                  <Field label="Email">
                    <input name="email" type="email" className="input" maxLength={150} />
                  </Field>
                  <Field label="Phone">
                    <input name="phone" className="input" maxLength={30} />
                  </Field>
                </div>
                <div className="mt-3 flex items-center justify-between">
                  <label className="flex items-center gap-2 text-sm">
                    <input type="checkbox" name="isPrimary" className="accent-brand" /> Primary contact
                  </label>
                  <SubmitButton>Add contact</SubmitButton>
                </div>
              </ActionForm>
            </div>
          )}

          {tab === "meetings" && (
            <div className="card overflow-x-auto">
              {meetings.length === 0 ? (
                <Empty>
                  No meetings with this client yet.{" "}
                  <Link href={`/meetings/new?client=${id}`} className="link">
                    Plan one
                  </Link>
                </Empty>
              ) : (
                <table className="table">
                  <thead>
                    <tr>
                      <th>Date</th>
                      <th>Meeting</th>
                      <th>Status</th>
                      <th>Next action</th>
                      <th>Follow-up</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {[...meetings].reverse().map((mt) => (
                      <tr key={mt.id}>
                        <td className="whitespace-nowrap">
                          {mt.startAt ? (
                            <>
                              {fmtDay(mt.startAt)}
                              <div className="text-xs text-slate-500">{fmtTime(mt.startAt)}</div>
                            </>
                          ) : (
                            <span className="text-slate-400">Not set</span>
                          )}
                        </td>
                        <td>
                          <Link href={`/meetings/${mt.id}`} className="link">
                            {TYPE_LABEL[mt.type]}
                          </Link>
                          <div className="max-w-xs text-xs text-slate-500">{mt.objective}</div>
                        </td>
                        <td>
                          <Badge tone={STATUS_TONE[mt.status]}>{STATUS_LABEL[mt.status]}</Badge>
                          {mt.briefStatus === "SUBMITTED" && (
                            <Link href={`/meetings/${mt.id}/brief`} className="mt-1 block text-xs text-emerald-700 hover:underline">
                              Brief ✓
                            </Link>
                          )}
                        </td>
                        <td className="max-w-xs text-slate-600">{mt.nextAction ?? "—"}</td>
                        <td className="whitespace-nowrap">{fmtPlainDate(mt.followUpDate)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
          )}

          {tab === "tasks" && (
            <div className="card">
              <Empty>Open tasks for this client arrive with the task planner (Phase 3).</Empty>
            </div>
          )}

          {tab === "activity" && (
            <div className="card">
              {activity.length === 0 ? (
                <Empty>No activity yet.</Empty>
              ) : (
                <ul className="divide-y divide-slate-100">
                  {activity.map((a) => (
                    <li key={a.id} className="px-4 py-3 text-sm">
                      <div className="flex justify-between gap-4">
                        <span>
                          <b>{a.user ?? "System"}</b> · {labelize(a.action)}
                        </span>
                        <span className="whitespace-nowrap text-xs text-slate-500">{fmtDateTime(a.at)}</span>
                      </div>
                      {a.details != null && <div className="mt-1 font-mono text-xs text-slate-500">{JSON.stringify(a.details)}</div>}
                    </li>
                  ))}
                </ul>
              )}
            </div>
          )}
        </div>
      </div>
    </>
  );
}
