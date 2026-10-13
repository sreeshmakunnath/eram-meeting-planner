import Link from "next/link";

export default function NotFound() {
  return (
    <div className="flex min-h-[60vh] flex-col items-center justify-center gap-3 text-center">
      <h1 className="text-2xl font-bold text-navy">Not found</h1>
      <p className="text-sm text-slate-500">That record doesn&apos;t exist or was removed.</p>
      <Link href="/" className="btn-primary">
        Back to dashboard
      </Link>
    </div>
  );
}
