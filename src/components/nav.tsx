"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { signOut } from "next-auth/react";
import { useEffect, useState } from "react";

type Item = { href: string; label: string; soon?: string };

export function Sidebar({ name, role }: { name: string; role: "ADMIN" | "USER" }) {
  const path = usePathname();
  const [open, setOpen] = useState(false);
  useEffect(() => setOpen(false), [path]); // close the phone menu after navigating
  const main: Item[] = [
    { href: "/", label: "Dashboard" },
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
        className={`block rounded-md px-3 py-2 text-sm font-medium ${isActive(i.href) ? "bg-white/15 text-white" : "text-white/80 hover:bg-white/10 hover:text-white"}`}
      >
        {i.label}
      </Link>
    );

  return (
    <aside className="flex w-full flex-col bg-navy text-white md:min-h-screen md:w-60 md:shrink-0">
      <div className="flex items-center justify-between px-5 py-4 md:py-5">
        <div>
          <div className="text-[11px] uppercase tracking-[0.2em] text-white/60">ERAM Holdings</div>
          <div className="text-lg font-bold">Meeting Planner</div>
        </div>
        <button onClick={() => setOpen(!open)} className="rounded-md border border-white/20 px-3 py-1.5 text-sm md:hidden" aria-expanded={open}>
          {open ? "Close" : "Menu"}
        </button>
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
