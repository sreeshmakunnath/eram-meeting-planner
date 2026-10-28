import Link from "next/link";
import { AutoSubmitSelect } from "@/components/auto-submit-select";
import { Badge, Empty, labelize, PageHeader } from "@/components/ui";
import { updateBdStage } from "@/lib/actions/clients";
import { countActive, FilterBar, FilterField } from "@/components/filters";
import { scopeToBu } from "@/lib/access";
import { requireUser } from "@/lib/auth";
import { clientStatusRows, FLAGS, type Flag } from "@/lib/client-status";
import { fmtDay, fmtPlainDate, STATUS_LABEL } from "@/lib/meetings";
import { BD_STAGE_LABELS, BD_STAGES } from "@/lib/queries";

type Search = { flag?: string; stage?: string; owner?: string; q?: string; bu?: string };
const FLAG_ORDER: Flag[] = ["OVERDUE", "TO_SCHEDULE", "BOOKED", "NO_NEXT_STEP", "NO_MEETING"];

export default async function ClientStatusPage({ searchParams }: { searchParams: Search }) {
  const me = await requireUser();
  const all = await clientStatusRows(scopeToBu(me, Number(searchParams.bu)) ?? me); // ?bu= from the BU overview
  const owners = [...new Map(all.filter((r) => r.ownerId).map((r) => [r.ownerId!, r.owner!])).entries()];
  const rows = all
    .filter((r) => !searchParams.flag || r.flag === searchParams.flag)
    .filter((r) => !searchParams.stage || r.bdStage === searchParams.stage)
    .filter((r) => !searchParams.owner || String(r.ownerId) === searchParams.owner)
    .filter((r) => !searchParams.q || r.name.toLowerCase().includes(searchParams.q.toLowerCase()))
    .sort((a, b) => FLAG_ORDER.indexOf(a.flag) - FLAG_ORDER.indexOf(b.flag) || a.name.localeCompare(b.name));
  const counts = Object.fromEntries(FLAG_ORDER.map((f) => [f, all.filter((r) => r.flag === f).length])) as Record<Flag, number>;
  const qs = new URLSearchParams(Object.entries(searchParams).filter(([, v]) => v) as [string, string][]).toString();
  const tile = (f: Flag) => {
    const active = searchParams.flag === f;
    const p = new URLSearchParams(Object.entries(searchParams).filter(([k, v]) => v && k !== "flag") as [string, string][]);
    if (!active) p.set("flag", f);
    return (
      <Link key={f} href={`/reports/client-status?${p}`} className={`card p-4 transition hover:border-brand/40 ${active ? "ring-2 ring-brand" : ""}`}>
        <div className="text-xs font-semibold uppercase tracking-wide text-slate-500">{FLAGS[f].label}</div>
        <div className={`mt-1 text-3xl font-bold ${f === "OVERDUE" && counts[f] ? "text-red-600" : "text-navy"}`}>{counts[f]}</div>
      </Link>
    );
  };

  return (
    <>
      <PageHeader
        title="Client status"
        subtitle={`Where every client stands — ${all.length} clients${me.role === "SUPER_ADMIN" ? "" : ", based on meetings you can see"}.`}
        actions={
          <a href={`/api/reports/client-status?${qs}`} className="btn-secondary">
            Export Excel
          </a>
        }
      />
      <div className="mb-5 grid gap-3 sm:grid-cols-3 lg:grid-cols-5">{FLAG_ORDER.map(tile)}</div>

<FilterBar
        keep={{ flag: searchParams.flag, bu: searchParams.bu }}
        clearHref={`/reports/client-status${searchParams.bu ? `?bu=${searchParams.bu}` : ""}`}
        active={countActive(searchParams, ["q", "stage", "owner"])}
      >
        <FilterField label="Search" size="lg">
          <input name="q" defaultValue={searchParams.q} placeholder="Client name" className="input" />
        </FilterField>
        <FilterField label="BD stage">
          <select name="stage" defaultValue={searchParams.stage ?? ""} className="input">
            <option value="">Any</option>
            {BD_STAGES.map((s) => (
              <option key={s} value={s}>
                {BD_STAGE_LABELS[s]}
              </option>
            ))}
          </select>
        </FilterField>
        <FilterField label="Account owner">
          <select name="owner" defaultValue={searchParams.owner ?? ""} className="input">
            <option value="">Anyone</option>
            {owners.map(([id, name]) => (
              <option key={id} value={id}>
                {name}
              </option>
            ))}
          </select>
        </FilterField>
      </FilterBar>

      <div className="card overflow-x-auto">
        {rows.length === 0 ? (
          <Empty>No clients match.</Empty>
        ) : (
          <table className="table">
            <thead>
              <tr>
                <th>Client</th>
                <th>Status</th>
                <th>BD stage</th>
                <th>Last meeting</th>
                <th>Next meeting</th>
                <th>Next action</th>
                <th>Follow-up</th>
                <th>Meetings</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {rows.map((r) => {
                const canStage = me.role !== "USER" || r.ownerId === me.id; // checked again on save
                return (
                  <tr key={r.id} className="hover:bg-slate-50">
                    <td className="min-w-[11rem]">
                      <Link href={`/clients/${r.id}?tab=meetings`} className="link">
                        {r.name}
                      </Link>
                      <div className="text-xs text-slate-500">
                        {r.location}
                        {r.owner ? ` · ${r.owner}` : ""}
                      </div>
                      {r.status === "PENDING_REVIEW" && <Badge tone="amber">Pending review</Badge>}
                    </td>
                    <td>
                      <Badge tone={FLAGS[r.flag].tone}>{FLAGS[r.flag].label}</Badge>
                      {r.priority === "HIGH" && <div className="mt-1 text-xs font-medium text-red-600">High priority</div>}
                    </td>
                    <td>
                      {canStage ? (
                        <form action={updateBdStage.bind(null, r.id)}>
                          <AutoSubmitSelect name="bdStage" defaultValue={r.bdStage ?? ""} className="input min-w-[8.5rem] py-1 text-xs" aria-label={`BD stage for ${r.name}`}>
                            <option value="">—</option>
                            {BD_STAGES.map((s) => (
                              <option key={s} value={s}>
                                {BD_STAGE_LABELS[s]}
                              </option>
                            ))}
                          </AutoSubmitSelect>
                        </form>
                      ) : r.bdStage ? (
                        BD_STAGE_LABELS[r.bdStage]
                      ) : (
                        "—"
                      )}
                    </td>
                    <td className="whitespace-nowrap">
                      {r.last ? (
                        <Link href={`/meetings/${r.last.id}`} className="link">
                          {fmtDay(r.last.at)}
                        </Link>
                      ) : (
                        "—"
                      )}
                      {r.last && <div className="text-xs text-slate-500">{STATUS_LABEL[r.last.status]}</div>}
                    </td>
                    <td className="whitespace-nowrap">
                      {r.next ? (
                        <>
                          <Link href={`/meetings/${r.next.id}`} className="link">
                            {fmtDay(r.next.at)}
                          </Link>
                          <div className="text-xs text-slate-500">{STATUS_LABEL[r.next.status]}</div>
                        </>
                      ) : r.waiting ? (
                        <Link href={`/meetings/${r.waiting.id}/edit`} className="text-amber-700 hover:underline">
                          To be scheduled{r.waiting.count > 1 ? ` (${r.waiting.count})` : ""}
                        </Link>
                      ) : (
                        "—"
                      )}
                    </td>
                    <td className="min-w-[14rem] max-w-xs text-slate-600">
                      {r.nextAction ?? "—"}
                      {r.actionOwners && <div className="text-xs text-slate-500">Owner: {r.actionOwners}</div>}
                      {r.openTasks > 0 && (
                        <Link href={`/clients/${r.id}?tab=tasks`} className="block text-xs text-slate-500 hover:underline">
                          {r.openTasks} open task{r.openTasks === 1 ? "" : "s"}
                          {r.overdueTasks ? <span className="font-semibold text-red-600"> · {r.overdueTasks} overdue</span> : ""}
                          {r.nextDeadline ? ` · next due ${fmtPlainDate(r.nextDeadline)}` : ""}
                        </Link>
                      )}
                    </td>
                    <td className={`whitespace-nowrap ${r.flag === "OVERDUE" ? "font-semibold text-red-600" : ""}`}>{fmtPlainDate(r.followUp)}</td>
                    <td className="whitespace-nowrap text-slate-600">
                      {r.completed}/{r.meetings} done
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>
      <p className="mt-3 text-xs text-slate-500">
        Status rules: <b>Follow-up overdue</b> — an open meeting&apos;s follow-up date has passed and nothing is booked. <b>Meeting booked</b> — a scheduled or confirmed meeting
        is coming up. <b>To be scheduled</b> — a meeting is planned without a date. Client types: {["CLIENT", "PROSPECT", "PARTNER", "VENDOR"].map(labelize).join(", ")}.
      </p>
    </>
  );
}
