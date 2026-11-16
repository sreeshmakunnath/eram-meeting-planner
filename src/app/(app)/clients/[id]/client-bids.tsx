import { and, asc, eq, or, sql } from "drizzle-orm";
import Link from "next/link";
import { ActionForm, SubmitButton, type ActionState } from "@/components/action-form";
import { Badge, Empty } from "@/components/ui";
import { db, schema } from "@/db";
import { bidVisibleTo } from "@/lib/access";
import type { SessionUser } from "@/lib/auth";
import { BAND_LABEL, BID_STAGE_LABEL, BID_STAGE_TONE, BID_STAGES, isOpenStage, usd, usdShort, type BidStage } from "@/lib/bids";
import { fmtPlainDate, todayRiyadh } from "@/lib/meetings";

/**
 * A client's bids — as the client, or as end client of a bid through a main contractor — that the viewer may
 * see. Bids follow the business-unit rule, so only the viewer's units count (everything for a Super Admin).
 */
export async function loadClientBids(me: SessionUser, clientId: number) {
  const b = schema.bids;
  const main = schema.clients;
  return db
    .select({
      id: b.id,
      title: b.title,
      stage: b.stage,
      bidValue: b.bidValue,
      band: b.probabilityBand,
      closingDate: b.closingDate,
      unit: schema.businessUnits.code,
      projectId: b.projectId,
      viaClient: sql<string | null>`case when ${b.clientId} <> ${clientId} then ${main.name} end`,
    })
    .from(b)
    .innerJoin(main, eq(b.clientId, main.id))
    .innerJoin(schema.businessUnits, eq(b.businessUnitId, schema.businessUnits.id))
    .where(and(or(eq(b.clientId, clientId), eq(b.endClientId, clientId)), bidVisibleTo(me)))
    .orderBy(sql`case when ${b.stage} in ('ENQUIRY','PRE_BID','SUBMITTED','UNDER_EVALUATION','NEGOTIATION') then 0 else 1 end`, asc(b.closingDate));
}
export type ClientBid = Awaited<ReturnType<typeof loadClientBids>>[number];

/** Compact summary for the client's side panel: open bids and value, won / lost, and a chip per stage. */
export function BidsSummary({ clientId, bids }: { clientId: number; bids: ClientBid[] }) {
  const open = bids.filter((b) => isOpenStage(b.stage));
  const byStage = BID_STAGES.map((s) => [s, bids.filter((b) => b.stage === s).length] as const).filter(([, n]) => n > 0);
  return (
    <div className="mt-4 border-t border-slate-100 pt-3">
      <div className="mb-2 flex items-baseline justify-between">
        <span className="text-xs uppercase tracking-wide text-slate-500">Bids</span>
        <span className="flex gap-3 text-xs">
          <Link href={`/bids/new?client=${clientId}`} className="link">
            + New
          </Link>
          {bids.length > 0 && (
            <Link href={`/bids?client=${clientId}&stage=ALL`} className="link">
              All bids →
            </Link>
          )}
        </span>
      </div>
      {bids.length === 0 ? (
        <p className="text-slate-500">No bids you can see.</p>
      ) : (
        <>
          <div className="mb-2 grid grid-cols-3 gap-2 text-center">
            {[
              ["Open", String(open.length), "text-navy"],
              ["Open value", usdShort(open.reduce((a, b) => a + (b.bidValue ?? 0), 0)), "text-navy"],
              ["Won / lost", `${bids.filter((b) => b.stage === "WON").length} / ${bids.filter((b) => b.stage === "LOST").length}`, "text-slate-700"],
            ].map(([k, v, tone]) => (
              <div key={k} className="rounded-md bg-slate-50 px-2 py-1.5">
                <div className={`font-semibold tabular-nums ${tone}`}>{v}</div>
                <div className="text-[11px] text-slate-500">{k}</div>
              </div>
            ))}
          </div>
          <div className="flex flex-wrap gap-1.5">
            {byStage.map(([s, n]) => (
              <Link key={s} href={`/bids?client=${clientId}&stage=${s}`} className="hover:opacity-80">
                <Badge tone={BID_STAGE_TONE[s]}>
                  {BID_STAGE_LABEL[s]} · {n}
                </Badge>
              </Link>
            ))}
          </div>
        </>
      )}
    </div>
  );
}

type Project = { id: number; name: string; location: string | null; description: string | null; createdById: number | null };

/** The client's projects (client information: anyone who can see the client sees them). */
export const loadClientProjects = (clientId: number) =>
  db
    .select({
      id: schema.clientProjects.id,
      name: schema.clientProjects.name,
      location: schema.clientProjects.location,
      description: schema.clientProjects.description,
      createdById: schema.clientProjects.createdById,
    })
    .from(schema.clientProjects)
    .where(eq(schema.clientProjects.clientId, clientId))
    .orderBy(asc(schema.clientProjects.name));

function BidRows({ bids }: { bids: ClientBid[] }) {
  const today = todayRiyadh();
  return (
    <table className="table">
      <tbody className="divide-y divide-slate-100">
        {bids.map((b) => {
          const left = Math.round((Date.parse(b.closingDate) - Date.parse(today)) / 86400_000);
          return (
            <tr key={b.id} className="hover:bg-slate-50">
              <td className="max-w-[20rem]">
                <Link href={`/bids/${b.id}`} className="link block truncate font-medium">
                  {b.title}
                </Link>
                {b.viaClient && <span className="text-xs text-slate-500">End client, via {b.viaClient}</span>}
              </td>
              <td className="w-14 font-mono text-xs">{b.unit}</td>
              <td className="w-44">
                <Badge tone={BID_STAGE_TONE[b.stage as BidStage]}>{BID_STAGE_LABEL[b.stage as BidStage]}</Badge>
              </td>
              <td className="w-28 whitespace-nowrap text-right tabular-nums">{usd(b.bidValue)}</td>
              <td className="w-20">{b.band ? BAND_LABEL[b.band] : "—"}</td>
              <td className="w-32 whitespace-nowrap">
                {fmtPlainDate(b.closingDate)}
                {isOpenStage(b.stage) && left <= 7 && (
                  <span className={`block text-xs font-semibold ${left < 0 ? "text-red-600" : "text-amber-700"}`}>
                    {left < 0 ? `${-left} days past` : left === 0 ? "Today" : `in ${left} days`}
                  </span>
                )}
              </td>
            </tr>
          );
        })}
      </tbody>
    </table>
  );
}

/**
 * The client's Bids tab, grouped by project: each project with its bid count, open and won value, then bids
 * with no project. Projects with no visible bids still show (they are the client's, not a unit's). Beside it,
 * forms to add a project and edit the existing ones.
 */
export function BidsTab({
  clientId,
  bids,
  projects,
  editableIds,
  addProject,
  updateProject,
  deleteProject,
}: {
  clientId: number;
  bids: ClientBid[];
  projects: Project[];
  /** Projects this person may rename or delete. */
  editableIds: number[];
  addProject: (s: ActionState, fd: FormData) => Promise<ActionState>;
  updateProject: Record<number, (s: ActionState, fd: FormData) => Promise<ActionState>>;
  deleteProject: Record<number, () => Promise<void>>;
}) {
  const groups = [
    ...projects.map((p) => ({ project: p as Project | null, bids: bids.filter((b) => b.projectId === p.id) })),
    { project: null, bids: bids.filter((b) => !b.projectId || !projects.some((p) => p.id === b.projectId)) },
  ].filter((g) => g.project || g.bids.length);
  const sum = (list: ClientBid[]) => list.reduce((a, b) => a + (b.bidValue ?? 0), 0);
  const editable = projects.filter((p) => editableIds.includes(p.id));

  return (
    <div className="grid gap-4 xl:grid-cols-12">
      <div className="space-y-3 xl:col-span-9">
        {groups.length === 0 && (
          <div className="card">
            <Empty>
              No projects or bids you can see for this client.{" "}
              <Link href={`/bids/new?client=${clientId}`} className="link">
                Add a bid
              </Link>
            </Empty>
          </div>
        )}
        {groups.map(({ project, bids: list }) => {
          const open = list.filter((b) => isOpenStage(b.stage));
          const won = list.filter((b) => b.stage === "WON");
          return (
            <section key={project?.id ?? "none"} className="card overflow-x-auto">
              <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1 border-b border-slate-200 bg-slate-50/60 px-4 py-2.5">
                <div className="min-w-0">
                  <h3 className="font-semibold text-navy">{project ? project.name : "No project"}</h3>
                  {project && (project.location || project.description) && (
                    <p className="truncate text-xs text-slate-500">{[project.location, project.description].filter(Boolean).join(" · ")}</p>
                  )}
                </div>
                <div className="flex items-center gap-4 text-xs text-slate-600">
                  <span>
                    <b className="tabular-nums text-navy">{list.length}</b> bid{list.length === 1 ? "" : "s"}
                  </span>
                  <span>
                    Open <b className="tabular-nums text-navy">{open.length ? usdShort(sum(open)) : "—"}</b>
                  </span>
                  <span>
                    Won <b className="tabular-nums text-emerald-700">{won.length ? usdShort(sum(won)) : "—"}</b>
                  </span>
                  {project && list.length > 0 && (
                    <Link href={`/bids?client=${clientId}&project=${project.id}&stage=ALL`} className="link">
                      In bids list →
                    </Link>
                  )}
                </div>
              </div>
              {list.length ? <BidRows bids={list} /> : <p className="px-4 py-3 text-sm text-slate-500">No bids you can see yet.</p>}
            </section>
          );
        })}
      </div>

      <aside className="space-y-4 xl:col-span-3">
        <ActionForm action={addProject} className="card space-y-3 p-4">
          <h3 className="font-semibold text-navy">Add a project</h3>
          <input name="name" className="input" placeholder="Project name *" maxLength={200} required />
          <input name="location" className="input" placeholder="Location" maxLength={150} />
          <textarea name="description" className="input min-h-[3.5rem]" placeholder="Short description" />
          <SubmitButton>Add project</SubmitButton>
        </ActionForm>
        {editable.length > 0 && (
          <section className="card p-4">
            <h3 className="mb-2 font-semibold text-navy">Edit projects</h3>
            <ul className="space-y-2 text-sm">
              {editable.map((p) => (
                <li key={p.id}>
                  <details>
                    <summary className="cursor-pointer text-slate-700 hover:text-navy">{p.name}</summary>
                    <ActionForm action={updateProject[p.id]} className="mt-2 space-y-2">
                      <input name="name" className="input" defaultValue={p.name} maxLength={200} required />
                      <input name="location" className="input" defaultValue={p.location ?? ""} placeholder="Location" maxLength={150} />
                      <textarea name="description" className="input min-h-[3rem]" defaultValue={p.description ?? ""} placeholder="Short description" />
                      <SubmitButton variant="secondary">Save</SubmitButton>
                    </ActionForm>
                    <form action={deleteProject[p.id]} className="mt-1">
                      <button className="text-xs text-red-700 hover:underline">Delete project (its bids are kept, without a project)</button>
                    </form>
                  </details>
                </li>
              ))}
            </ul>
          </section>
        )}
      </aside>
    </div>
  );
}
