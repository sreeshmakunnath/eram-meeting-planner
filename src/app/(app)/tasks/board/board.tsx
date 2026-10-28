"use client";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { DueDelta } from "@/components/due-delta";
import { setTaskStatus } from "@/lib/actions/tasks";

type Card = { id: number; title: string; status: string; client: string | null; assignees: string; dueDate: string | null; overdue: boolean; doneDelta: number | null; priority: string; canMove: boolean };
const COLUMNS: [string, string][] = [
  ["NOT_STARTED", "Not started"],
  ["STARTED", "Started"],
  ["IN_PROGRESS", "In progress"],
  ["ON_HOLD", "On hold"],
  ["COMPLETED", "Completed"],
];
const fmt = (d: string | null) => (d ? new Date(`${d.slice(0, 10)}T00:00:00Z`).toLocaleDateString("en-GB", { day: "numeric", month: "short", timeZone: "UTC" }) : "");

/** Kanban board: drag a card to another column (or use its menu) to change status. */
export function Board({ cards: initial }: { cards: Card[] }) {
  const [cards, setCards] = useState(initial);
  const [dragId, setDragId] = useState<number | null>(null);
  const [over, setOver] = useState<string | null>(null);
  const [msg, setMsg] = useState<string | null>(null);
  const [, start] = useTransition();
  const router = useRouter();

  function move(id: number, status: string) {
    const card = cards.find((c) => c.id === id);
    if (!card || card.status === status) return;
    if (!card.canMove) {
      setMsg("You can only move tasks you created or are assigned to.");
      return;
    }
    const prev = cards;
    setCards(cards.map((c) => (c.id === id ? { ...c, status, overdue: status === "COMPLETED" ? false : c.overdue } : c)));
    start(async () => {
      const res = await setTaskStatus(id, status as never);
      if (res?.error) {
        setCards(prev);
        setMsg(res.error);
      } else {
        setMsg(null);
        router.refresh();
      }
    });
  }

  return (
    <>
      {msg && <div className="mb-3 rounded-md border border-red-200 bg-red-50 px-4 py-2 text-sm text-red-800">{msg}</div>}
      <div className="grid gap-3 overflow-x-auto md:grid-cols-5">
        {COLUMNS.map(([status, label]) => {
          const list = cards.filter((c) => c.status === status);
          return (
            <div
              key={status}
              onDragOver={(e) => {
                e.preventDefault();
                setOver(status);
              }}
              onDragLeave={() => setOver(null)}
              onDrop={(e) => {
                e.preventDefault();
                setOver(null);
                if (dragId) move(dragId, status);
              }}
              className={`min-h-[12rem] min-w-[14rem] rounded-lg border p-2 transition ${over === status ? "border-brand bg-brand-50" : "border-slate-200 bg-slate-100/60"}`}
            >
              <div className="mb-2 flex items-center justify-between px-1 text-xs font-semibold uppercase tracking-wide text-slate-500">
                {label}
                <span className="rounded-full bg-white px-2 text-slate-600">{list.length}</span>
              </div>
              <div className="space-y-2">
                {list.map((c) => (
                  <div
                    key={c.id}
                    draggable={c.canMove}
                    onDragStart={() => setDragId(c.id)}
                    onDragEnd={() => setDragId(null)}
                    className={`rounded-md border bg-white p-2.5 text-sm shadow-sm ${c.canMove ? "cursor-grab" : ""} ${c.overdue ? "border-red-300" : "border-slate-200"}`}
                  >
                    <Link href={`/tasks/${c.id}`} className="font-medium text-navy hover:underline">
                      {c.title}
                    </Link>
                    {c.client && <div className="text-xs text-slate-500">{c.client}</div>}
                    <div className="mt-1.5 flex items-center justify-between text-xs">
                      <span className="truncate text-slate-500">{c.assignees}</span>
                      {c.dueDate && (
                        <span className={c.overdue ? "font-semibold text-red-600" : "text-slate-500"}>
                          {fmt(c.dueDate)} <DueDelta days={c.doneDelta} />
                        </span>
                      )}
                    </div>
                    {c.canMove && (
                      <select
                        aria-label="Move to"
                        value={c.status}
                        onChange={(e) => move(c.id, e.target.value)}
                        className="mt-2 w-full rounded border border-slate-200 bg-slate-50 px-1 py-0.5 text-xs text-slate-600 md:hidden"
                      >
                        {COLUMNS.map(([v, l]) => (
                          <option key={v} value={v}>
                            {l}
                          </option>
                        ))}
                      </select>
                    )}
                  </div>
                ))}
              </div>
            </div>
          );
        })}
      </div>
    </>
  );
}
