export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-screen items-center justify-center bg-gradient-to-br from-navy to-brand p-4">
      <div className="w-full max-w-md">
        <div className="mb-6 text-center text-white">
          <div className="text-sm uppercase tracking-[0.2em] text-white/70">ERAM Holdings</div>
          <div className="text-2xl font-bold">Meeting Planner</div>
        </div>
        <div className="card p-8">{children}</div>
      </div>
    </div>
  );
}
