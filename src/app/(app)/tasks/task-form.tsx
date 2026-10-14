import { and, asc, desc, isNotNull, ne } from "drizzle-orm";
import Link from "next/link";
import { ActionForm, SubmitButton } from "@/components/action-form";
import { CheckboxList } from "@/components/checkbox-list";
import { Field } from "@/components/ui";
import { db, schema } from "@/db";
import type { Task } from "@/db/schema";
import { saveTask } from "@/lib/actions/tasks";
import type { SessionUser } from "@/lib/auth";
import { fmtPlainDate, riyadhParts, visibleTo } from "@/lib/meetings";
import { activeGroups, activeUsers } from "@/lib/queries";
import { CATEGORY_LABEL, TASK_STATUS_LABEL } from "@/lib/tasks";

export async function TaskForm({
  me,
  task,
  userIds = [],
  groupIds = [],
  defaults = {},
}: {
  me: SessionUser;
  task?: Task;
  userIds?: number[];
  groupIds?: number[];
  defaults?: { meetingId?: number | null; clientId?: number | null; title?: string; category?: string };
}) {
  const [users, groups, clients, meetings] = await Promise.all([
    activeUsers(),
    activeGroups(),
    db.select({ id: schema.clients.id, name: schema.clients.name }).from(schema.clients).where(ne(schema.clients.status, "INACTIVE")).orderBy(asc(schema.clients.name)),
    db
      .select({ id: schema.meetings.id, title: schema.meetings.title, startAt: schema.meetings.startAt })
      .from(schema.meetings)
      .where(and(visibleTo(me), isNotNull(schema.meetings.id)))
      .orderBy(desc(schema.meetings.createdAt))
      .limit(200),
  ]);
  const v = { ...defaults, ...task };
  return (
    <ActionForm action={saveTask} className="card p-6">
      {task && <input type="hidden" name="id" value={task.id} />}
      <div className="grid gap-4 md:grid-cols-3">
        <div className="md:col-span-3">
          <Field label="Title *">
            <input name="title" className="input" defaultValue={v.title} maxLength={200} required placeholder='e.g. "MIR report – Lamprell"' />
          </Field>
        </div>
        <Field label="Category">
          <select name="category" className="input" defaultValue={v.category ?? "GENERAL"}>
            {Object.entries(CATEGORY_LABEL).map(([k, l]) => (
              <option key={k} value={k}>
                {l}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Priority">
          <select name="priority" className="input" defaultValue={task?.priority ?? "MEDIUM"}>
            <option value="HIGH">High</option>
            <option value="MEDIUM">Medium</option>
            <option value="LOW">Low</option>
          </select>
        </Field>
        <Field label="Status">
          <select name="status" className="input" defaultValue={task?.status ?? "NOT_STARTED"}>
            {Object.entries(TASK_STATUS_LABEL).map(([k, l]) => (
              <option key={k} value={k}>
                {l}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Start date">
          <input type="date" name="startDate" className="input" defaultValue={task?.startDate?.slice(0, 10) ?? ""} />
        </Field>
        <Field label="Due date *">
          <input type="date" name="dueDate" className="input" defaultValue={task?.dueDate?.slice(0, 10) ?? ""} required />
        </Field>
        <Field label="% complete">
          <input type="number" name="percent" min={0} max={100} step={5} className="input" defaultValue={task?.percent ?? 0} />
        </Field>
        <Field label="Client">
          <select name="clientId" className="input" defaultValue={v.clientId ?? ""}>
            <option value="">—</option>
            {clients.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
        </Field>
        <div className="md:col-span-2">
          <Field label="Linked meeting" hint="Shown on the meeting page; sets the client if empty.">
            <select name="meetingId" className="input" defaultValue={v.meetingId ?? ""}>
              <option value="">—</option>
              {meetings.map((m) => (
                <option key={m.id} value={m.id}>
                  {m.title}
                  {m.startAt ? ` · ${fmtPlainDate(riyadhParts(m.startAt).date)}` : " · not scheduled"}
                </option>
              ))}
            </select>
          </Field>
        </div>
        <div className="md:col-span-3">
          <Field label="Description">
            <textarea name="description" className="input" rows={3} defaultValue={task?.description ?? ""} />
          </Field>
        </div>
        <div>
          <span className="label">Assign to groups</span>
          <CheckboxList name="groupIds" options={groups.map((g) => ({ id: g.id, label: g.name }))} selected={groupIds} empty="No groups yet." />
          {!task && (
            <div className="mt-2 space-y-1 text-sm">
              <label className="flex items-start gap-2">
                <input type="radio" name="groupMode" value="SHARED" defaultChecked className="mt-1 accent-brand" />
                <span>
                  <b>Shared</b> — one task for the whole group
                </span>
              </label>
              <label className="flex items-start gap-2">
                <input type="radio" name="groupMode" value="INDIVIDUAL" className="mt-1 accent-brand" />
                <span>
                  <b>Individual</b> — a separate copy for each member
                </span>
              </label>
            </div>
          )}
        </div>
        <div className="md:col-span-2">
          <span className="label">Assign to people</span>
          <CheckboxList name="userIds" options={users.map((u) => ({ id: u.id, label: u.fullName, hint: u.email }))} selected={userIds} />
          <p className="mt-1 text-xs text-slate-500">New assignees get an email.</p>
        </div>
      </div>
      <div className="mt-6 flex justify-end gap-2">
        <Link href={task ? `/tasks/${task.id}` : "/tasks"} className="btn-secondary">
          Cancel
        </Link>
        <SubmitButton>{task ? "Save task" : "Create task"}</SubmitButton>
      </div>
    </ActionForm>
  );
}
