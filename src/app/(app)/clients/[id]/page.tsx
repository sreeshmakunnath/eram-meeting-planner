import { and, asc, desc, eq, inArray, isNotNull, ne } from "drizzle-orm";
import { alias } from "drizzle-orm/pg-core";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ActionForm, SubmitButton } from "@/components/action-form";
import { Badge, Empty, Field, fmtDateTime, labelize, Notice, PageHeader, statusTone, Tabs } from "@/components/ui";
import { db, schema } from "@/db";
import { addContact, approveClient, deleteContact, mergeClient, restoreContact, setContactSharing, setPrimaryContact } from "@/lib/actions/clients";
import { canApproveClient, canManageClient, canSeeClient, clientVisibleTo, contactVisibleTo, usersWhoCanSeeClient } from "@/lib/access";
import { isAdmin, isSuperAdmin, requireUser } from "@/lib/auth";
import { BD_STAGE_LABELS } from "@/lib/queries";
import { listMeetings } from "@/lib/meeting-queries";
import { listTasks } from "@/lib/task-queries";
import { TaskMiniList } from "@/components/task-mini-list";
import { fmtDay, fmtPlainDate, fmtTime, STATUS_LABEL, STATUS_TONE, TYPE_LABEL } from "@/lib/meetings";
import { isSimilar } from "@/lib/similar";
import { SharingFields } from "./sharing-fields";

const messages: Record<string, { tone: "ok" | "error"; text: string }> = {
  saved: { tone: "ok", text: "Client saved." },
  approved: { tone: "ok", text: "Client approved and now available in dropdowns." },
  merged: { tone: "ok", text: "Duplicate merged into this client; its contacts were moved here." },
  mergefail: { tone: "error", text: "Pick a different client to merge into." },
  sharefail: { tone: "error", text: "Tick at least one person to share with, or choose Private." },
  denied: { tone: "error", text: "You don't have permission to do that." },
};

/** "Approved as Manager" plus the approver's remarks. */
function ApprovalNote({ details }: { details: unknown }) {
  const d = (details ?? {}) as { as?: string; remarks?: string | null };
  return (
    <div className="mt-1 text-xs text-slate-600">
      {d.as && <span className="text-slate-500">Approved as {d.as}</span>}
      {d.remarks && <div className="mt-1 rounded border-l-2 border-emerald-300 bg-emerald-50/50 px-2 py-1 text-sm text-slate-700">{d.remarks}</div>}
    </div>
  );
}

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
          businessUnits: { with: { businessUnit: { columns: { name: true } } } },
        },
      })
    : undefined;
  if (!client || !(await canSeeClient(me, id))) notFound();
  const editable = await canManageClient(me, client);
  const canApprove = client.status === "PENDING_REVIEW" && (await canApproveClient(me, client));
  const canMerge = canApprove && isAdmin(me) && editable;
  const owner = alias(schema.users, "owner");
  const contacts = await db
    .select({ contact: schema.clientContacts, owner: owner.fullName })
    .from(schema.clientContacts)
    .leftJoin(owner, eq(schema.clientContacts.ownerId, owner.id))
    .where(and(eq(schema.clientContacts.clientId, id), contactVisibleTo(me)))
    .orderBy(desc(schema.clientContacts.isPrimary), asc(schema.clientContacts.name))
    // Same rule as canManageContact: the person who added it or the account owner; shared ones also client editors
    .then((rows) =>
      rows.map((r) => ({
        ...r.contact,
        owner: r.owner,
        canManage: isSuperAdmin(me) || r.contact.ownerId === me.id || client.accountOwnerId === me.id || (r.contact.shared && editable),
      })),
    );
  // Who each contact is shared with individually, and who it could be shared with (people who can see the client)
  const shares = contacts.length
    ? await db
        .select({ contactId: schema.contactShares.contactId, userId: schema.contactShares.userId, name: schema.users.fullName })
        .from(schema.contactShares)
        .innerJoin(schema.users, eq(schema.contactShares.userId, schema.users.id))
        .where(inArray(schema.contactShares.contactId, contacts.map((c) => c.id)))
        .orderBy(asc(schema.users.fullName))
    : [];
  const sharedWith = (contactId: number) => shares.filter((s) => s.contactId === contactId);
  const viewers = (searchParams.tab ?? "contacts") === "contacts" ? await usersWhoCanSeeClient(id) : [];
  // Super Admins: deleted contacts, to restore
  const deletedBy = alias(schema.users, "deleted_by");
  const deletedContacts =
    isSuperAdmin(me) && (searchParams.tab ?? "contacts") === "contacts"
      ? await db
          .select({ contact: schema.clientContacts, owner: owner.fullName, deletedBy: deletedBy.fullName })
          .from(schema.clientContacts)
          .leftJoin(owner, eq(schema.clientContacts.ownerId, owner.id))
          .leftJoin(deletedBy, eq(schema.clientContacts.deletedById, deletedBy.id))
          .where(and(eq(schema.clientContacts.clientId, id), isNotNull(schema.clientContacts.deletedAt)))
          .orderBy(desc(schema.clientContacts.deletedAt))
      : [];
  const tab = searchParams.tab ?? "contacts";
  const msg = searchParams.msg ? messages[searchParams.msg] : undefined;
  const base = `/clients/${id}`;

  const allClients =
    canMerge
      ? await db
          .select({ id: schema.clients.id, name: schema.clients.name })
          .from(schema.clients)
          .where(and(ne(schema.clients.id, id), clientVisibleTo(me)))
          .orderBy(asc(schema.clients.name))
      : [];
  const meetings = tab === "meetings" ? await listMeetings(me, { client: String(id), status: "ALL" }) : [];
  const clientTasks = tab === "tasks" ? await listTasks(me, { scope: "all", bucket: "any", client: String(id) }) : [];
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
            <Link href={`${base}/edit`} className="btn-primary">
              Edit client
            </Link>
          </>
        }
      />
      {msg && <Notice tone={msg.tone}>{msg.text}</Notice>}

      {canApprove && (
        <div className="card mb-6 border-amber-200 bg-amber-50/50 p-4">
          <div className="mb-3 text-sm text-amber-900">
            Added by {client.createdBy?.fullName ?? "a user"} and waiting for review.
            {possibleDuplicates.length > 0 && <> Possible duplicates: {possibleDuplicates.map((d) => d.name).join(", ")}.</>}
          </div>
          <div className="flex flex-wrap items-center gap-3">
            <form action={approveClient.bind(null, id)} className="flex flex-wrap items-center gap-2">
              <input name="remarks" maxLength={1000} placeholder="Remarks (optional), e.g. checked with the BD team" className="input w-80 max-w-full" />
              <button className="btn-primary">Approve</button>
            </form>
            {canMerge && (
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
            )}
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
              { href: `${base}?tab=contacts`, label: `Contacts (${contacts.length})` },
              { href: `${base}?tab=meetings`, label: "Meetings" },
              { href: `${base}?tab=tasks`, label: "Tasks" },
              { href: `${base}?tab=activity`, label: "Activity" },
            ]}
          />

          {tab === "contacts" && (
            <div className="space-y-6">
              <div className="card overflow-x-auto">
                {contacts.length === 0 ? (
                  <Empty>No contacts you can see yet. Add one below.</Empty>
                ) : (
                  <table className="table">
                    <thead>
                      <tr>
                        <th>Name</th>
                        <th>Email</th>
                        <th>Phone</th>
                        <th>Visibility</th>
                        <th />
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {contacts.map((c) => (
                        <tr key={c.id}>
                          <td>
                            {c.name} {c.isPrimary && <Badge tone="blue">Primary</Badge>}
                            {c.designation && <div className="text-xs text-slate-500">{c.designation}</div>}
                          </td>
                          <td>{c.email ? <a href={`mailto:${c.email}`} className="link">{c.email}</a> : "—"}</td>
                          <td>{c.phone ?? "—"}</td>
                          <td className="whitespace-nowrap">
                            {c.shared ? (
                              <Badge tone="green">Everyone</Badge>
                            ) : sharedWith(c.id).length ? (
                              <span title={sharedWith(c.id).map((s) => s.name).join(", ")}>
                                <Badge tone="blue">Shared with {sharedWith(c.id).length}</Badge>
                              </span>
                            ) : (
                              <Badge>Private</Badge>
                            )}
                            {!c.shared && sharedWith(c.id).length > 0 && (
                              <div className="max-w-[14rem] truncate text-xs text-slate-500">{sharedWith(c.id).map((s) => s.name).join(", ")}</div>
                            )}
                            {c.owner && <div className="text-xs text-slate-500">Added by {c.ownerId === me.id ? "you" : c.owner}</div>}
                          </td>
                          <td className="whitespace-nowrap text-right">
                            {!c.isPrimary && (
                              <form action={setPrimaryContact.bind(null, id, c.id)} className="inline">
                                <button className="text-xs text-brand hover:underline">Make primary</button>
                              </form>
                            )}
                            {c.canManage && (
                              <details className="relative ml-3 inline-block text-left">
                                <summary className="cursor-pointer list-none text-xs text-brand hover:underline">Sharing…</summary>
                                <form action={setContactSharing.bind(null, id, c.id)} className="card mt-2 w-72 space-y-3 whitespace-normal p-3 shadow-lg">
                                  <SharingFields
                                    visibility={c.shared ? "everyone" : sharedWith(c.id).length ? "selected" : "private"}
                                    selected={sharedWith(c.id).map((s) => s.userId)}
                                    people={viewers.filter((v) => v.id !== c.ownerId)}
                                  />
                                  <button className="btn-primary w-full py-1.5 text-sm">Save sharing</button>
                                </form>
                              </details>
                            )}
                            {c.canManage && (
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
              {deletedContacts.length > 0 && (
                <details className="card">
                  <summary className="cursor-pointer px-4 py-3 text-sm font-semibold text-slate-600">
                    Deleted contacts ({deletedContacts.length}) <span className="font-normal text-slate-400">· only Super Admins see these</span>
                  </summary>
                  <ul className="divide-y divide-slate-100 border-t border-slate-100">
                    {deletedContacts.map(({ contact: c, owner: addedBy, deletedBy: by }) => (
                      <li key={c.id} className="flex flex-wrap items-center justify-between gap-3 px-4 py-2.5 text-sm">
                        <div>
                          <span className="text-slate-700">{c.name}</span>
                          {c.designation && <span className="text-slate-500"> · {c.designation}</span>}
                          <div className="text-xs text-slate-500">
                            {[c.email, c.phone].filter(Boolean).join(" · ")}
                            {(c.email || c.phone) && " — "}
                            {c.shared ? "Everyone" : "Private or selected people"}, added by {addedBy ?? "—"}; deleted by {by ?? "—"} on {fmtDateTime(c.deletedAt!)}
                          </div>
                        </div>
                        <form action={restoreContact.bind(null, id, c.id)}>
                          <button className="btn-secondary py-1 text-xs">Restore</button>
                        </form>
                      </li>
                    ))}
                  </ul>
                </details>
              )}
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
                <div className="mt-4 grid gap-4 md:grid-cols-2">
                  <div>
                    <span className="label">Who can see it</span>
                    <SharingFields visibility="private" people={viewers.filter((v) => v.id !== me.id)} />
                  </div>
                  <div className="flex flex-col justify-between gap-3">
                    <label className="flex items-center gap-2 text-sm">
                      <input type="checkbox" name="isPrimary" className="accent-brand" /> Primary contact
                    </label>
                    <div className="flex justify-end">
                      <SubmitButton>Add contact</SubmitButton>
                    </div>
                  </div>
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
              <TaskMiniList
                rows={[...clientTasks.filter((t) => t.status !== "COMPLETED" && t.status !== "CANCELLED"), ...clientTasks.filter((t) => t.status === "COMPLETED")]}
                empty="No tasks for this client yet."
                newHref={`/tasks/new?client=${id}`}
              />
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
                      {a.action === "CLIENT_APPROVED" ? (
                        <ApprovalNote details={a.details} />
                      ) : (
                        a.details != null && <div className="mt-1 font-mono text-xs text-slate-500">{JSON.stringify(a.details)}</div>
                      )}
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
