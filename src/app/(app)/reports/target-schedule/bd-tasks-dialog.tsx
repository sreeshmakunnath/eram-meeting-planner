"use client";
import { useEffect, useRef } from "react";
import { useFormState } from "react-dom";
import { SubmitButton, type ActionState } from "@/components/action-form";

export type BdTaskDefault = { category: string; label: string; title: string; due: string };

/** "+ Create BD tasks" on the target schedule: a popup with the missing BD tasks, each with a title, person and due date to adjust. */
export function BdTasksDialog({
  action,
  clientName,
  tasks,
  people,
  defaultAssigneeId,
  partial,
}: {
  action: (s: ActionState, fd: FormData) => Promise<ActionState>;
  clientName: string;
  tasks: BdTaskDefault[];
  people: { id: number; fullName: string }[];
  defaultAssigneeId: number;
  partial: boolean;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  const [state, formAction] = useFormState(action, undefined);
  // Close once the tasks are created; the schedule refreshes with the new dates.
  useEffect(() => {
    if (state?.ok) ref.current?.close();
  }, [state]);

  return (
    <>
      <button type="button" onClick={() => ref.current?.showModal()} className="text-xs font-medium text-brand hover:underline">
        {partial ? "+ Add missing BD tasks" : "+ Create BD tasks"}
      </button>
      <dialog ref={ref} className="w-[min(56rem,calc(100vw-2rem))] rounded-lg p-0 shadow-xl backdrop:bg-slate-900/40">
        <form action={formAction} className="p-5 text-sm text-slate-700">
          <div className="mb-4 flex items-start justify-between gap-4">
            <div>
              <h2 className="text-lg font-semibold text-navy">BD tasks – {clientName}</h2>
              <p className="text-slate-500">Untick any you don&apos;t need. Each person gets the task in their list with a notification.</p>
            </div>
            <button type="button" onClick={() => ref.current?.close()} className="text-slate-400 hover:text-slate-600" aria-label="Close">
              ✕
            </button>
          </div>
          {state?.error && <div className="mb-4 rounded-md border border-red-200 bg-red-50 px-4 py-3 text-red-800">{state.error}</div>}
          <div className="overflow-x-auto">
            <table className="w-full min-w-[40rem]">
              <thead>
                <tr className="text-left text-xs font-semibold uppercase tracking-wide text-slate-500">
                  <th className="w-8 py-2" />
                  <th className="py-2 pr-3">Task</th>
                  <th className="py-2 pr-3">Assign to</th>
                  <th className="py-2">Due date</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {tasks.map((t) => (
                  <tr key={t.category}>
                    <td className="py-2">
                      <input type="checkbox" name="categories" value={t.category} defaultChecked className="accent-brand" aria-label={`Create ${t.label}`} />
                    </td>
                    <td className="py-2 pr-3">
                      <div className="mb-1 text-xs font-semibold text-slate-500">{t.label}</div>
                      <input name={`title_${t.category}`} defaultValue={t.title} maxLength={200} className="input" required />
                    </td>
                    <td className="py-2 pr-3 align-bottom">
                      <select name={`assignee_${t.category}`} defaultValue={defaultAssigneeId} className="input">
                        {people.map((p) => (
                          <option key={p.id} value={p.id}>
                            {p.fullName}
                          </option>
                        ))}
                      </select>
                    </td>
                    <td className="py-2 align-bottom">
                      <input type="date" name={`due_${t.category}`} defaultValue={t.due} className="input" required />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="mt-5 flex justify-end gap-2">
            <button type="button" onClick={() => ref.current?.close()} className="btn-secondary">
              Cancel
            </button>
            <SubmitButton>Create tasks</SubmitButton>
          </div>
        </form>
      </dialog>
    </>
  );
}
