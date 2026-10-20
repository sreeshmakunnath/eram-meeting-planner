import { Sidebar } from "@/components/nav";
import { requireUser } from "@/lib/auth";
import { unreadCount } from "@/lib/notifications";

export const dynamic = "force-dynamic";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const user = await requireUser();
  const unread = await unreadCount(user.id);
  return (
    <div className="flex min-h-screen flex-col md:flex-row">
      <Sidebar name={user.name} role={user.role} unread={unread} />
      <main className="min-w-0 flex-1 bg-[url('/bg-pattern.svg')] bg-[length:240px_240px] px-4 py-6 md:px-8">
        <div className="mx-auto max-w-screen-2xl">{children}</div>
      </main>
    </div>
  );
}
