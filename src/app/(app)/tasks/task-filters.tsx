import { isAdmin, type SessionUser } from "@/lib/auth";
import type { TaskFilters } from "@/lib/task-queries";
import { CATEGORY_LABEL, TASK_STATUS_LABEL } from "@/lib/tasks";
import { activeGroups, activeUsers, clientOptions } from "@/lib/queries";

/** Shared filter bar for list / board / timeline. */
export async function TaskFilterBar({ me, f, showBucket = true }: { me: SessionUser; f: TaskFilters; showBucket?: boolean }) {
  const [users, groups, clients] = await Promise.all([
    activeUsers(),
    activeGroups(),
    clientOptions(me),
  ]);
  return (
    <form className="card mb-4 grid gap-3 p-3 sm:grid-cols-3 lg:grid-cols-8">
      {showBucket && f.bucket && <input type="hidden" name="bucket" value={f.bucket} />}
      <select name="scope" defaultValue={f.scope ?? "mine"} className="input">
        <option value="mine">Assigned to me</option>
        <option value="created">Created by me</option>
        <option value="all">{me.role === "SUPER_ADMIN" ? "Everyone" : isAdmin(me) ? "Everyone in my business units" : "All I can see"}</option>
      </select>
      <input name="q" defaultValue={f.q} placeholder="Search tasks" className="input lg:col-span-2" />
      <select name="category" defaultValue={f.category ?? ""} className="input">
        <option value="">Any category</option>
        {Object.entries(CATEGORY_LABEL).map(([v, l]) => (
          <option key={v} value={v}>
            {l}
          </option>
        ))}
      </select>
      <select name="client" defaultValue={f.client ?? ""} className="input">
        <option value="">Any client</option>
        {clients.map((c) => (
          <option key={c.id} value={c.id}>
            {c.name}
          </option>
        ))}
      </select>
      <select name="user" defaultValue={f.user ?? ""} className="input">
        <option value="">Any assignee</option>
        {users.map((u) => (
          <option key={u.id} value={u.id}>
            {u.fullName}
          </option>
        ))}
      </select>
      <select name="group" defaultValue={f.group ?? ""} className="input">
        <option value="">Any group</option>
        {groups.map((g) => (
          <option key={g.id} value={g.id}>
            {g.name}
          </option>
        ))}
      </select>
      <div className="flex gap-2">
        {showBucket && (
          <select name="status" defaultValue={f.status ?? ""} className="input">
            <option value="">Any status</option>
            {Object.entries(TASK_STATUS_LABEL).map(([v, l]) => (
              <option key={v} value={v}>
                {l}
              </option>
            ))}
          </select>
        )}
        <button className="btn-secondary">Filter</button>
      </div>
    </form>
  );
}
