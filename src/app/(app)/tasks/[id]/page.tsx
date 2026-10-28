import { asc, desc, eq } from "drizzle-orm";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { ActionForm, SubmitButton } from "@/components/action-form";
import { AutoSubmitCheckbox } from "@/components/auto-submit-checkbox";
import { Badge, Empty, fmtDateTime, labelize, Notice, PageHeader } from "@/components/ui";
import { db, schema } from "@/db";
import { addComment, addSubtask, deleteTask, setTaskStatus, toggleSubtask, updateProgress } from "@/lib/actions/tasks";
import { requireUser } from "@/lib/auth";
import { fmtDay, fmtPlainDate, PRIORITY_LABEL, todayRiyadh } from "@/lib/meetings";
import { activeUsers } from "@/lib/queries";
import { canCommentOnTask, canEditTask, canViewTask, canWorkOnTask, CATEGORY_LABEL, OPEN_STATUSES, TASK_STATUS_LABEL, TASK_STATUS_TONE, type TaskStatus } from "@/lib/tasks";

const messages: Record<string, { tone: "ok" | "error"; text: string }> = {
  saved: { tone: "ok", text: "Task saved." },
  denied: { tone: "error", text: "Only the creator or an Admin can edit or delete this task." },
  subdeleted: { tone: "ok", text: "Subtask deleted." },
};

export default async function TaskPage({ params, searchParams }: { params: { id: string }; searchParams: { msg?: string } }) {
  const me = await requireUser();
  const id = Number(params.id);
  if (!Number.isInteger(id)) notFound();
  const task = await db.query.tasks.findFirst({
    where: eq(schema.tasks.id, id),
    with: {
      client: { columns: { id: true, name: true } },
      meeting: { columns: { id: true, title: true, startAt: true } },
      createdBy: { columns: { fullName: true } },
      assignees: { with: { user: { columns: { id: true, fullName: true } }, viaGroup: { columns: { name: true } } } },
      groups: { with: { group: { columns: { id: true, name: true } } } },
      parent: { columns: { id: true, title: true } },
      businessUnit: { columns: { name: true } },
      subtasks: {
        orderBy: (s, { asc }) => [asc(s.createdAt), asc(s.id)],
        with: { assignees: { with: { user: { columns: { fullName: true } } } } },
      },
      comments: { orderBy: (c, { asc }) => [asc(c.createdAt)], with: { user: { columns: { fullName: true } } } },
    },
  });
  if (!task) notFound();
  if (!(await canViewTask(me, id))) redirect("/tasks");
  const editable = await canEditTask(me, task);
  const canWork = await canWorkOnTask(me, task);
  const canComment = canWork || (await canCommentOnTask(me, task)); // managers of the people on it can comment
  const [subtasks, people] = await Promise.all([
    Promise.all(task.subtasks.map(async (s) => ({ ...s, canWork: await canWorkOnTask(me, s) }))),
    task.parentTaskId ? Promise.resolve([]) : activeUsers(),
  ]);
  const activity = await db
    .select({ id: schema.taskActivity.id, at: schema.taskActivity.createdAt, action: schema.taskActivity.action, details: schema.taskActivity.details, user: schema.users.fullName })
    .from(schema.taskActivity)
    .leftJoin(schema.users, eq(schema.taskActivity.userId, schema.users.id))
    .where(eq(schema.taskActivity.taskId, id))
    .orderBy(desc(schema.taskActivity.createdAt))
    .limit(50);
  const overdue = !!task.dueDate && task.dueDate.slice(0, 10) < todayRiyadh() && OPEN_STATUSES.includes(task.status);
  const msg = searchParams.msg ? messages[searchParams.msg] : undefined;
  const quick: [TaskStatus, string][] =
    task.status === "COMPLETED" || task.status === "CANCELLED"
      ? [["IN_PROGRESS", "Reopen"]]
      : [
          ...(task.status === "NOT_STARTED" ? ([["STARTED", "Start"]] as [TaskStatus, string][]) : []),
          ["COMPLETED", "Mark complete"],
        ];

  return (
    <>
      <PageHeader
        title={task.title}
        subtitle={`${CATEGORY_LABEL[task.category]} · created by ${task.createdBy?.fullName ?? "—"} on ${fmtDateTime(task.createdAt)}`}
        actions={
          <>
            <Badge tone={TASK_STATUS_TONE[task.status]}>{TASK_STATUS_LABEL[task.status]}</Badge>
            {overdue && <Badge tone="red">Overdue</Badge>}
          </>
        }
      />
      {msg && <Notice tone={msg.tone}>{msg.text}</Notice>}
      {task.parent && (
        <Notice tone="info">
          Subtask of{" "}
          <Link href={`/tasks/${task.parent.id}`} className="underline">
            {task.parent.title}
          </Link>
          . Completing it updates the main task&apos;s progress.
        </Notice>
      )}
      {task.sourceBriefId && task.meeting && (
        <Notice tone="info">
          Agreed action from the Meeting Brief of{" "}
          <Link href={`/meetings/${task.meeting.id}/brief`} className="underline">
            {task.meeting.title}
          </Link>
          . Changing the action on the brief updates this task.
        </Notice>
      )}
      <div className="mb-5 flex flex-wrap gap-2">
        {canWork &&
          quick.map(([s, label]) => (
            <form
              key={s}
              action={async () => {
                "use server";
                await setTaskStatus(id, s);
              }}
            >
              <button className={s === "COMPLETED" ? "btn-primary" : "btn-secondary"}>{label}</button>
            </form>
          ))}
        {editable && (
          <>
            <Link href={`/tasks/${id}/edit`} className="btn-secondary">
              Edit
            </Link>
            <form action={deleteTask.bind(null, id)}>
              <button className="btn-danger">Delete</button>
            </form>
          </>
        )}
      </div>

      <div className="grid gap-6 lg:grid-cols-3">
        <div className="space-y-6 lg:col-span-2">
          {task.description && !(task.sourceBriefId && task.description.startsWith("Agreed action from")) && (
            <div className="card whitespace-pre-wrap p-5 text-sm">{task.description}</div>
          )}

          {!task.parentTaskId && (
            <section className="card p-5">
              <h2 className="mb-3 font-semibold text-navy">
                Subtasks{" "}
                {subtasks.length > 0 && (
                  <span className="font-normal text-slate-500">
                    ({subtasks.filter((s) => s.status === "COMPLETED").length}/{subtasks.length} done)
                  </span>
                )}
              </h2>
              {subtasks.length > 0 && (
                <ul className="mb-3 divide-y divide-slate-100">
                  {subtasks.map((s) => {
                    const done = s.status === "COMPLETED";
                    const late = !!s.dueDate && s.dueDate.slice(0, 10) < todayRiyadh() && OPEN_STATUSES.includes(s.status);
                    return (
                      <li key={s.id} className="flex flex-wrap items-center justify-between gap-x-4 gap-y-1 py-2 text-sm">
                        <form action={toggleSubtask.bind(null, s.id, !done)} className="flex min-w-0 items-center gap-2">
                          <AutoSubmitCheckbox checked={done} disabled={!s.canWork} label={s.title} />
                          <Link href={`/tasks/${s.id}`} className={`truncate hover:underline ${done ? "text-slate-400 line-through" : s.status === "CANCELLED" ? "text-slate-400" : "text-slate-700"}`}>
                            {s.title}
                          </Link>
                        </form>
                        <span className="flex items-center gap-3 text-xs text-slate-500">
                          <span>{s.assignees.map((a) => a.user.fullName).join(", ") || "—"}</span>
                          <span className={late ? "font-semibold text-red-600" : ""}>{s.dueDate ? fmtPlainDate(s.dueDate) : "no due date"}</span>
                          {!done && <Badge tone={TASK_STATUS_TONE[s.status]}>{TASK_STATUS_LABEL[s.status]}</Badge>}
                        </span>
                      </li>
                    );
                  })}
                </ul>
              )}
              {canWork && (
                <ActionForm action={addSubtask.bind(null, id)} className="grid gap-2 sm:grid-cols-[1fr_12rem_10rem_auto]">
                  <input name="title" className="input" placeholder="Add a subtask…" maxLength={200} required />
                  <select name="assigneeId" className="input" defaultValue="" required aria-label="Assign to">
                    <option value="" disabled>
                      Assign to…
                    </option>
                    {people.map((u) => (
                      <option key={u.id} value={u.id}>
                        {u.fullName}
                      </option>
                    ))}
                  </select>
                  <input name="dueDate" type="date" className="input" defaultValue={task.dueDate?.slice(0, 10) ?? ""} aria-label="Due date" />
                  <SubmitButton variant="secondary">Add</SubmitButton>
                </ActionForm>
              )}
              <p className="mt-2 text-xs text-slate-500">
                Each subtask is a task of its own: the person gets it in their task list with a notification. Completing subtasks updates this task&apos;s % complete.
              </p>
            </section>
          )}

          <section className="card">
            <h2 className="border-b border-slate-200 px-5 py-3 font-semibold text-navy">Comments</h2>
            {task.comments.length ? (
              <ul className="divide-y divide-slate-100">
                {task.comments.map((c) => (
                  <li key={c.id} className="px-5 py-3 text-sm">
                    <div className="mb-1 flex justify-between text-xs text-slate-500">
                      <b className="text-slate-700">{c.user.fullName}</b>
                      {fmtDateTime(c.createdAt)}
                    </div>
                    <div className="whitespace-pre-wrap">{c.body}</div>
                  </li>
                ))}
              </ul>
            ) : (
              <Empty>No comments yet.</Empty>
            )}
            {canComment && (
              <ActionForm action={addComment.bind(null, id)} className="border-t border-slate-100 p-4">
                <textarea name="body" className="input mb-2" rows={2} placeholder="Write a comment. Type @username or @Firstname to notify someone." required />
                <div className="flex justify-end">
                  <SubmitButton>Comment</SubmitButton>
                </div>
              </ActionForm>
            )}
          </section>

          <section className="card">
            <h2 className="border-b border-slate-200 px-5 py-3 font-semibold text-navy">Activity</h2>
            <ul className="divide-y divide-slate-100">
              {activity.map((a) => (
                <li key={a.id} className="flex justify-between gap-4 px-5 py-2 text-sm">
                  <span>
                    <b>{a.user ?? "System"}</b> · {labelize(a.action)}{" "}
                    <span className="text-slate-500">
                      {a.action === "STATUS_CHANGED"
                        ? `${TASK_STATUS_LABEL[(a.details as { from: TaskStatus }).from]} → ${TASK_STATUS_LABEL[(a.details as { to: TaskStatus }).to]}`
                        : a.action === "PROGRESS"
                          ? `${(a.details as { from: number }).from}% → ${(a.details as { to: number }).to}%`
                          : a.details
                            ? Object.entries(a.details as Record<string, unknown>)
                                .map(([k, v]) => `${k}: ${Array.isArray(v) ? v.join(", ") : v}`)
                                .join(" · ")
                            : ""}
                    </span>
                  </span>
                  <span className="whitespace-nowrap text-xs text-slate-500">{fmtDateTime(a.at)}</span>
                </li>
              ))}
            </ul>
          </section>
        </div>

        <aside className="space-y-6">
          <section className="card divide-y divide-slate-100 px-5 text-sm">
            {[
              ["Due", <span key="d" className={overdue ? "font-semibold text-red-600" : ""}>{fmtPlainDate(task.dueDate)}</span>],
              ["Start", fmtPlainDate(task.startDate)],
              ["Priority", PRIORITY_LABEL[task.priority]],
              ["Business unit", task.businessUnit.name],
              [
                "Client",
                task.client ? (
                  <Link key="c" href={`/clients/${task.client.id}?tab=tasks`} className="link">
                    {task.client.name}
                  </Link>
                ) : (
                  "—"
                ),
              ],
              [
                "Meeting",
                task.meeting ? (
                  <Link key="m" href={`/meetings/${task.meeting.id}`} className="link">
                    {task.meeting.title}
                    {task.meeting.startAt ? ` (${fmtDay(task.meeting.startAt)})` : ""}
                  </Link>
                ) : (
                  "—"
                ),
              ],
              ["Completed", task.completedAt ? fmtDateTime(task.completedAt) : "—"],
            ].map(([k, v]) => (
              <div key={k as string} className="flex justify-between gap-3 py-2.5">
                <span className="text-slate-500">{k}</span>
                <span className="text-right">{v}</span>
              </div>
            ))}
          </section>

          {canWork && (
            <ActionForm action={updateProgress.bind(null, id)} className="card space-y-3 p-5">
              <h2 className="font-semibold text-navy">Progress</h2>
              <select name="status" className="input" defaultValue={task.status}>
                {Object.entries(TASK_STATUS_LABEL).map(([k, l]) => (
                  <option key={k} value={k}>
                    {l}
                  </option>
                ))}
              </select>
              <label className="block text-sm">
                <span className="label">% complete</span>
                <input type="range" name="percent" min={0} max={100} step={5} defaultValue={task.percent} className="w-full accent-brand" />
              </label>
              <div className="h-1.5 rounded-full bg-slate-100">
                <div className="h-1.5 rounded-full bg-brand" style={{ width: `${task.percent}%` }} />
              </div>
              <div className="flex items-center justify-between">
                <span className="text-sm text-slate-500">{task.percent}% now</span>
                <SubmitButton variant="secondary">Update</SubmitButton>
              </div>
            </ActionForm>
          )}

          <section className="card">
            <h2 className="border-b border-slate-200 px-5 py-3 font-semibold text-navy">Assigned to</h2>
            {task.groups.length > 0 && (
              <div className="flex flex-wrap gap-1 border-b border-slate-100 px-5 py-2">
                {task.groups.map((g) => (
                  <Link key={g.group.id} href={`/groups/${g.group.id}`} className="rounded-full bg-brand-50 px-2.5 py-0.5 text-xs text-navy">
                    {g.group.name}
                  </Link>
                ))}
              </div>
            )}
            <ul className="divide-y divide-slate-100 text-sm">
              {[...task.assignees]
                .sort((a, b) => a.user.fullName.localeCompare(b.user.fullName))
                .map((a) => (
                  <li key={a.userId} className="px-5 py-2">
                    {a.user.fullName}
                    {a.viaGroup && <span className="block text-xs text-slate-500">via {a.viaGroup.name}</span>}
                  </li>
                ))}
            </ul>
          </section>
        </aside>
      </div>
    </>
  );
}
