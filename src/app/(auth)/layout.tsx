import { Logo } from "@/components/logo";

export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="relative flex min-h-screen items-center justify-center overflow-hidden bg-gradient-to-br from-navy via-navy-600 to-brand p-4">
      {/* Soft colour glows behind the glass card; the blur needs something to show through. */}
      <div aria-hidden className="pointer-events-none absolute inset-0">
        <div className="absolute -left-24 -top-24 h-96 w-96 rounded-full bg-brand/60 blur-3xl" />
        <div className="absolute -bottom-32 -right-16 h-[28rem] w-[28rem] rounded-full bg-sky-400/40 blur-3xl" />
        <div className="absolute left-1/2 top-1/3 h-72 w-72 -translate-x-1/2 rounded-full bg-indigo-400/25 blur-3xl" />
      </div>

      <div className="relative w-full max-w-md">
        <div className="glass rounded-2xl border border-white/25 bg-white/10 p-8 shadow-2xl shadow-navy/40 backdrop-blur-xl">
          <div className="mb-6 flex flex-col items-center gap-3 text-center text-white">
            <Logo on="dark" className="h-16" />
            <div className="text-2xl font-bold">Meeting Planner</div>
          </div>
          {children}
        </div>
        <p className="mt-6 text-center text-xs text-white/60">© {new Date().getFullYear()} ERAM Holdings</p>
      </div>
    </div>
  );
}
