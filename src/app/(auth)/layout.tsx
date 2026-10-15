import { Logo } from "@/components/logo";

export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="relative flex min-h-screen items-center justify-center overflow-hidden bg-navy bg-[url('/bg-login.svg')] bg-cover bg-center p-4">
      {/* One soft glow right behind the glass card so its blur has colour to pick up. */}
      <div aria-hidden className="pointer-events-none absolute inset-0">
        <div className="absolute left-1/2 top-1/2 h-[30rem] w-[30rem] -translate-x-1/2 -translate-y-1/2 rounded-full bg-brand/30 blur-3xl" />
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
