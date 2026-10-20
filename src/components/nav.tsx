"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { signOut } from "next-auth/react";
import { useEffect, useState } from "react";
import { Logo } from "./logo";

type Item = { href: string; label: string; soon?: string; badge?: number };

export function Sidebar({ name, role, unread: initialUnread = 0 }: { name: string; role: "ADMIN" | "USER"; unread?: number }) {
  const path = usePathname();
  const [open, setOpen] = useState(false);
  useEffect(() => setOpen(false), [path]); // close the phone menu after navigating

  // The layout isn't re-rendered between pages, so refresh the unread badge on each page change and every minute.
  const [unread, setUnread] = useState(initialUnread);
  useEffect(() => {
    let live = true;
    const load = () =>
      fetch("/api/notifications/unread", { cache: "no-store" })
        .then((r) => (r.ok ? r.json() : null))
        .then((d) => live && d && setUnread(d.count))
        .catch(() => {});
    load();
    const t = setInterval(load, 60_000);
    return () => {
      live = false;
      clearInterval(t);
    };
  }, [path]);
  const main: Item[] = [
    { href: "/", label: "Dashboard" },
    { href: "/notifications", label: "Notifications", badge: unread },
    { href: "/meetings", label: "Meetings" },
    { href: "/meetings/calendar", label: "Calendar" },
    { href: "/tasks", label: "Tasks" },
    { href: "/clients", label: "Clients" },
    { href: "/groups", label: "Groups" },
  ];
  const reports: Item[] = [
    { href: "/reports/client-status", label: "Client status" },
    { href: "/reports/target-schedule", label: "Target schedule" },
    { href: "/reports/tasks", label: "Task report" },
  ];
  const admin: Item[] = [
    { href: "/admin/users", label: "Users" },
    { href: "/admin/masters", label: "Branches & BUs" },
    { href: "/admin/audit", label: "Audit log" },
  ];
  const isActive = (href: string) =>
    href === "/" ? path === "/" : href === "/meetings" ? path.startsWith("/meetings") && !path.startsWith("/meetings/calendar") : path.startsWith(href);
  const link = (i: Item) =>
    i.soon ? (
      <span key={i.href} className="flex items-center justify-between rounded-md px-3 py-2 text-sm text-white/40">
        {i.label}
        <span className="rounded bg-white/10 px-1.5 text-[10px] uppercase tracking-wide">{i.soon}</span>
      </span>
    ) : (
      <Link
        key={i.href}
        href={i.href}
        className={`flex items-center justify-between rounded-md px-3 py-2 text-sm font-medium ${isActive(i.href) ? "bg-white/15 text-white" : "text-white/80 hover:bg-white/10 hover:text-white"}`}
      >
        {i.label}
        {!!i.badge && (
          <span className="min-w-[1.25rem] rounded-full bg-red-500 px-1.5 text-center text-[11px] font-bold leading-5 text-white" aria-label={`${i.badge} unread`}>
            {i.badge > 99 ? "99+" : i.badge}
          </span>
        )}
      </Link>
    );

  return (
    <aside className="flex w-full flex-col bg-navy text-white md:min-h-screen md:w-60 md:shrink-0">
      <div className="flex items-center justify-between px-5 py-4 md:py-5">
        <div className="flex flex-col items-start gap-2">
          <Logo on="dark" className="h-11" />
          <div className="text-lg font-bold">Meeting Planner</div>
        </div>
        <div className="flex items-center gap-2 md:hidden">
          {unread > 0 && (
            <Link href="/notifications" className="rounded-full bg-red-500 px-2 text-xs font-bold leading-6 text-white" aria-label={`${unread} unread notifications`}>
              {unread > 99 ? "99+" : unread}
            </Link>
          )}
          <button onClick={() => setOpen(!open)} className="rounded-md border border-white/20 px-3 py-1.5 text-sm" aria-expanded={open}>
            {open ? "Close" : "Menu"}
          </button>
        </div>
      </div>
      <nav className={`flex-1 space-y-1 px-3 pb-3 ${open ? "block" : "hidden"} md:block`}>
        {main.map(link)}
        <div className="px-3 pb-1 pt-5 text-[11px] font-semibold uppercase tracking-wider text-white/50">Reports</div>
        {reports.map(link)}
        {role === "ADMIN" && (
          <>
            <div className="px-3 pb-1 pt-5 text-[11px] font-semibold uppercase tracking-wider text-white/50">Administration</div>
            {admin.map(link)}
          </>
        )}
      </nav>
      <div className={`border-t border-white/10 px-5 py-4 text-sm ${open ? "block" : "hidden"} md:block`}>
        <Link href="/profile" className="block font-semibold hover:underline">
          {name}
        </Link>
        <div className="text-xs text-white/60">{role === "ADMIN" ? "Admin" : "User"}</div>
        <button onClick={() => signOut({ callbackUrl: "/login" })} className="mt-3 text-xs text-white/70 hover:text-white">
          Sign out
        </button>
      </div>
    </aside>
  );
}
