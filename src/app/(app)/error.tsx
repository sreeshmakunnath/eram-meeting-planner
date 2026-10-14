"use client";
import { useEffect } from "react";

/** Shown when a page fails to load — most often because the database can't be reached. */
export default function AppError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => console.error(error), [error]);
  const db = /ETIMEDOUT|ECONNREFUSED|ENOTFOUND|connect|database|terminat/i.test(error.message);
  return (
    <div className="card mx-auto mt-10 max-w-xl p-6">
      <h1 className="mb-2 text-lg font-bold text-navy">{db ? "Can't reach the database" : "Something went wrong"}</h1>
      <p className="mb-4 text-sm text-slate-600">
        {db
          ? "The app couldn't connect to PostgreSQL. Check that DATABASE_URL in .env is right and that your network allows the connection (office networks often block port 5432; Neon URLs use port 443 automatically)."
          : "This page couldn't be loaded. Try again; if it keeps happening, check the server terminal for the error."}
      </p>
      {error.digest && <p className="mb-4 font-mono text-xs text-slate-400">Reference: {error.digest}</p>}
      <button onClick={reset} className="btn-primary">
        Try again
      </button>
    </div>
  );
}
