import { countActive, FilterBar, FilterField } from "@/components/filters";
import { selectableBus, teamIds } from "@/lib/access";
import { isAdmin, isSuperAdmin, type SessionUser } from "@/lib/auth";
import type { TaskFilters } from "@/lib/task-queries";
import { CATEGORY_LABEL, TASK_STATUS_LABEL } from "@/lib/tasks";
import { activeGroups, activeUsers, clientOptions } from "@/lib/queries";

/** Shared filter bar for list / board / timeline. `path` is the page, for the Clear link. */
export async function TaskFilterBar({ me, f, path, showBucket = true }: { me: SessionUser; f: TaskFilters; path: string; showBucket?: boolean }) {
  const [users, groups, clients, units, team] = await Promise.all([activeUsers(), activeGroups(), clientOptions(me), selectableBus(me), teamIds(me.id)]);
  const keys = ["scope", "q", "bu", "client", "user", "group", "category", ...(showBucket ? ["status"] : [])];
  const bucket = showBucket ? f.bucket : undefined;
  return (
    <FilterBar
      keep={{ bucket }}
      clearHref={bucket ? `${path}?bucket=${bucket}` : path}
      active={countActive(f as Record<string, string | undefined>, keys, { scope: "mine" })}
    >
      <FilterField label="Search" size="lg">
        <input name="q" defaultValue={f.q} placeholder="Title, description or client" className="input" />
      </FilterField>
      <FilterField label="Show">
        <select name="scope" defaultValue={f.scope ?? "mine"} className="input">
          <option value="mine">Assigned to me</option>
          <option value="created">Created by me</option>
          {(team.length > 0 || f.scope === "team") && <option value="team">My team&apos;s</option>}
          <option value="all">{isSuperAdmin(me) ? "Everyone's" : isAdmin(me) ? "All in my business units" : "All I can see"}</option>
        </select>
      </FilterField>
      {units.length > 1 && (
        <FilterField label="Business unit">
          <select name="bu" defaultValue={f.bu ?? ""} className="input">
            <option value="">All</option>
            {units.map((u) => (
              <option key={u.id} value={u.id}>
                {u.name}
              </option>
            ))}
          </select>
        </FilterField>
      )}
      <FilterField label="Client">
        <select name="client" defaultValue={f.client ?? ""} className="input">
          <option value="">All</option>
          {clients.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
            </option>
          ))}
        </select>
      </FilterField>
      <FilterField label="Assignee">
        <select name="user" defaultValue={f.user ?? ""} className="input">
          <option value="">Anyone</option>
          {users.map((u) => (
            <option key={u.id} value={u.id}>
              {u.fullName}
            </option>
          ))}
        </select>
      </FilterField>
      <FilterField label="Group" size="sm">
        <select name="group" defaultValue={f.group ?? ""} className="input">
          <option value="">Any</option>
          {groups.map((g) => (
            <option key={g.id} value={g.id}>
              {g.name}
            </option>
          ))}
        </select>
      </FilterField>
      <FilterField label="Category" size="sm">
        <select name="category" defaultValue={f.category ?? ""} className="input">
          <option value="">Any</option>
          {Object.entries(CATEGORY_LABEL).map(([v, l]) => (
            <option key={v} value={v}>
              {l}
            </option>
          ))}
        </select>
      </FilterField>
      {showBucket && (
        <FilterField label="Status" size="sm">
          <select name="status" defaultValue={f.status ?? ""} className="input">
            <option value="">Any</option>
            {Object.entries(TASK_STATUS_LABEL).map(([v, l]) => (
              <option key={v} value={v}>
                {l}
              </option>
            ))}
          </select>
        </FilterField>
      )}
    </FilterBar>
  );
}
