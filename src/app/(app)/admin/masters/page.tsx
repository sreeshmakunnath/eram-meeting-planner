import { asc, sql } from "drizzle-orm";
import { ActionForm, SubmitButton } from "@/components/action-form";
import { Badge, PageHeader } from "@/components/ui";
import { db, schema } from "@/db";
import { addMaster, renameMaster, toggleMaster } from "@/lib/actions/masters";
import { requireAdmin } from "@/lib/auth";

type Row = { id: number; name: string; active: boolean; users: number };

function MasterCard({ kind, title, rows }: { kind: "branch" | "businessUnit"; title: string; rows: Row[] }) {
  return (
    <section className="card p-5">
      <h2 className="mb-1 text-lg font-semibold text-navy">{title}</h2>
      <p className="mb-4 text-sm text-slate-500">Inactive entries are hidden from dropdowns but kept on existing records.</p>
      <ul className="mb-4 divide-y divide-slate-100">
        {rows.map((r) => (
          <li key={r.id} className="flex flex-wrap items-center gap-2 py-2">
            <ActionForm action={renameMaster.bind(null, kind, r.id)} className="flex flex-1 items-center gap-2">
              <input name="name" defaultValue={r.name} className="input" maxLength={100} />
              <SubmitButton variant="secondary">Save</SubmitButton>
            </ActionForm>
            <span className="text-xs text-slate-500">{r.users} users</span>
            {!r.active && <Badge>Inactive</Badge>}
            <form action={toggleMaster.bind(null, kind, r.id, !r.active)}>
              <button className="btn-secondary px-3">{r.active ? "Deactivate" : "Activate"}</button>
            </form>
          </li>
        ))}
      </ul>
      <ActionForm action={addMaster.bind(null, kind)} className="flex gap-2">
        <input name="name" placeholder={`New ${kind === "branch" ? "branch" : "business unit"}`} className="input" maxLength={100} required />
        <SubmitButton>Add</SubmitButton>
      </ActionForm>
    </section>
  );
}

export default async function MastersPage() {
  await requireAdmin();
  const [branches, bus] = await Promise.all([
    db
      .select({
        id: schema.branches.id,
        name: schema.branches.name,
        active: schema.branches.active,
        users: sql<number>`(select count(*) from users u where u.branch_id = ${schema.branches.id})`.mapWith(Number),
      })
      .from(schema.branches)
      .orderBy(asc(schema.branches.name)),
    db
      .select({
        id: schema.businessUnits.id,
        name: schema.businessUnits.name,
        active: schema.businessUnits.active,
        users: sql<number>`(select count(*) from users u where u.business_unit_id = ${schema.businessUnits.id})`.mapWith(Number),
      })
      .from(schema.businessUnits)
      .orderBy(asc(schema.businessUnits.name)),
  ]);
  return (
    <>
      <PageHeader title="Branches & business units" subtitle="Master lists used on users, groups and clients." />
      <div className="grid gap-6 lg:grid-cols-2">
        <MasterCard kind="branch" title="Branches" rows={branches} />
        <MasterCard kind="businessUnit" title="Business units" rows={bus} />
      </div>
    </>
  );
}
