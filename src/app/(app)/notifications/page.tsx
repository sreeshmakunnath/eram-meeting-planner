import Link from "next/link";
import { Empty, fmtDateTime, PageHeader } from "@/components/ui";
import { markAllNotificationsRead } from "@/lib/actions/notifications";
import { requireUser } from "@/lib/auth";
import { listNotifications } from "@/lib/notifications";

export const dynamic = "force-dynamic";

// A short label per kind; the icon dot colour follows the area (meetings, tasks, groups).
const KIND: Record<string, { label: string; dot: string }> = {
  MEETING_INVITE: { label: "Meeting", dot: "bg-brand" },
  MEETING_UPDATED: { label: "Meeting updated", dot: "bg-brand" },
  MEETING_CONFIRMED: { label: "Meeting confirmed", dot: "bg-brand" },
  MEETING_CANCELLED: { label: "Meeting cancelled", dot: "bg-red-500" },
  BRIEF_SUBMITTED: { label: "Meeting Brief", dot: "bg-navy" },
  TASK_ASSIGNED: { label: "Task", dot: "bg-emerald-600" },
  TASK_COMPLETED: { label: "Task completed", dot: "bg-emerald-600" },
  MENTION: { label: "Mention", dot: "bg-amber-500" },
  GROUP_ADDED: { label: "Group", dot: "bg-slate-500" },
};

export default async function NotificationsPage() {
  const me = await requireUser();
  const rows = await listNotifications(me.id);
  const unread = rows.filter((r) => !r.readAt).length;

  return (
    <>
      <PageHeader
        title="Notifications"
        subtitle={unread ? `${unread} unread` : "You're all caught up."}
        actions={
          unread > 0 && (
            <form action={markAllNotificationsRead}>
              <button className="btn-secondary">Mark all as read</button>
            </form>
          )
        }
      />
      <div className="card">
        {rows.length === 0 ? (
          <Empty>No notifications yet. You&apos;ll see meeting invitations, task assignments, mentions and more here.</Empty>
        ) : (
          <ul className="divide-y divide-slate-100">
            {rows.map((n) => {
              const kind = KIND[n.kind] ?? { label: "Update", dot: "bg-slate-400" };
              return (
                <li key={n.id}>
                  <Link href={`/notifications/${n.id}`} className={`flex gap-3 px-4 py-3 hover:bg-slate-50 ${n.readAt ? "" : "bg-brand-50/60"}`}>
                    <span className={`mt-1.5 h-2.5 w-2.5 shrink-0 rounded-full ${kind.dot}`} aria-hidden />
                    <span className="min-w-0 flex-1">
                      <span className="flex flex-wrap items-baseline justify-between gap-x-3">
                        <span className={`text-sm ${n.readAt ? "text-slate-700" : "font-semibold text-navy"}`}>{n.title}</span>
                        <span className="whitespace-nowrap text-xs text-slate-400">{fmtDateTime(n.createdAt)}</span>
                      </span>
                      {n.body && <span className="mt-0.5 block whitespace-pre-line text-sm text-slate-500">{n.body}</span>}
                      <span className="mt-1 block text-xs text-slate-400">
                        {kind.label}
                        {n.actor ? ` · by ${n.actor}` : ""}
                        {!n.readAt && <span className="ml-2 font-semibold text-brand">New</span>}
                      </span>
                    </span>
                  </Link>
                </li>
              );
            })}
          </ul>
        )}
      </div>
      <p className="mt-3 text-xs text-slate-500">Read notifications are cleared after 90 days.</p>
    </>
  );
}
