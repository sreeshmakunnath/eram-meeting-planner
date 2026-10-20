import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { unreadCount } from "@/lib/notifications";

export const dynamic = "force-dynamic";

/** Unread notification count for the sidebar badge, which polls it. */
export async function GET() {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) return Response.json({ count: 0 }, { status: 401 });
  return Response.json({ count: await unreadCount(session.user.id) }, { headers: { "Cache-Control": "no-store" } });
}
