import Link from "next/link";

export function PageHeader({ title, subtitle, actions }: { title: string; subtitle?: string; actions?: React.ReactNode }) {
  return (
    <div className="mb-6 flex flex-wrap items-end justify-between gap-4">
      <div>
        <h1 className="text-2xl font-bold text-navy">{title}</h1>
        {subtitle && <p className="mt-1 text-sm text-slate-500">{subtitle}</p>}
      </div>
      {actions && <div className="flex flex-wrap gap-2">{actions}</div>}
    </div>
  );
}

const tones: Record<string, string> = {
  green: "bg-emerald-50 text-emerald-700 ring-emerald-600/20",
  gray: "bg-slate-100 text-slate-600 ring-slate-500/20",
  blue: "bg-brand-50 text-brand-600 ring-brand/20",
  amber: "bg-amber-50 text-amber-700 ring-amber-600/20",
  red: "bg-red-50 text-red-700 ring-red-600/20",
  navy: "bg-navy-50 text-navy ring-navy/20",
};
export function Badge({ tone = "gray", children }: { tone?: keyof typeof tones; children: React.ReactNode }) {
  return <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ring-1 ring-inset ${tones[tone]}`}>{children}</span>;
}

export function Field({ label, children, hint }: { label: string; children: React.ReactNode; hint?: string }) {
  return (
    <label className="block">
      <span className="label">{label}</span>
      {children}
      {hint && <span className="mt-1 block text-xs text-slate-500">{hint}</span>}
    </label>
  );
}

export function Empty({ children }: { children: React.ReactNode }) {
  return <div className="px-4 py-10 text-center text-sm text-slate-500">{children}</div>;
}

export function Notice({ tone, children }: { tone: "ok" | "error" | "info"; children: React.ReactNode }) {
  const cls = {
    ok: "border-emerald-200 bg-emerald-50 text-emerald-800",
    error: "border-red-200 bg-red-50 text-red-800",
    info: "border-brand/20 bg-brand-50 text-navy",
  }[tone];
  return <div className={`mb-4 rounded-md border px-4 py-3 text-sm ${cls}`}>{children}</div>;
}

export function Tabs({ items, active }: { items: { href: string; label: string }[]; active: string }) {
  return (
    <div className="mb-4 flex gap-1 border-b border-slate-200">
      {items.map((t) => (
        <Link
          key={t.href}
          href={t.href}
          className={`-mb-px border-b-2 px-3 py-2 text-sm font-medium ${t.href === active ? "border-brand text-navy" : "border-transparent text-slate-500 hover:text-slate-700"}`}
        >
          {t.label}
        </Link>
      ))}
    </div>
  );
}

export const fmtDate = (d: Date | string | null | undefined) =>
  d ? new Intl.DateTimeFormat("en-GB", { dateStyle: "medium", timeZone: "Asia/Riyadh" }).format(new Date(d)) : "—";
export const fmtDateTime = (d: Date | string | null | undefined) =>
  d ? new Intl.DateTimeFormat("en-GB", { dateStyle: "medium", timeStyle: "short", timeZone: "Asia/Riyadh" }).format(new Date(d)) : "—";

export const labelize = (s: string | null | undefined) =>
  s ? s.toLowerCase().replace(/_/g, " ").replace(/^\w/, (c) => c.toUpperCase()) : "—";

export const statusTone = (s: string) => (s === "ACTIVE" ? "green" : s === "PENDING_REVIEW" ? "amber" : "gray") as "green" | "amber" | "gray";
